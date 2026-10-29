<?php

declare(strict_types=1);

use FaroAi\FaroAi;
use FaroAi\OpenRouterClient;
use FaroAi\ProductSearch;
use FaroAi\RateLimiter;
use FaroAi\Store;

require __DIR__ . '/src/ConsentGate.php';
require __DIR__ . '/src/RateLimiter.php';
require __DIR__ . '/src/OpenRouterClient.php';
require __DIR__ . '/src/Store.php';
require __DIR__ . '/src/ProductSearch.php';
require __DIR__ . '/src/FaroAi.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start(['cookie_httponly' => true, 'cookie_samesite' => 'Lax']);
}

$config = require __DIR__ . '/config.php';
$dbPath = (string) $config['db_path'];
$dbDirectory = dirname($dbPath);
if (!is_dir($dbDirectory)) {
    @mkdir($dbDirectory, 0700, true);
}

function faroai_json(array $body, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function faroai_csrf(): string
{
    if (!isset($_SESSION['faroai_csrf']) || !is_string($_SESSION['faroai_csrf'])) {
        $_SESSION['faroai_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['faroai_csrf'];
}

function faroai_require_csrf(array $input): void
{
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($provided) || $provided === '') {
        $provided = is_string($input['csrf'] ?? null) ? $input['csrf'] : '';
    }
    if (!is_string($provided) || !hash_equals(faroai_csrf(), $provided)) {
        faroai_json(['success' => false, 'error' => 'csrf', 'message' => 'Your session expired. Please reload the page.'], 403);
    }
}

$action = is_string($_GET['action'] ?? null) ? $_GET['action'] : 'chat';
if ($action === 'health' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    faroai_json(['success' => true, 'service' => 'faroai', 'model_configured' => (string) ($config['openrouter']['api_key'] ?? '') !== '' && (string) ($config['openrouter']['model'] ?? '') !== '']);
}
if ($action === 'token' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    faroai_json(['success' => true, 'csrf' => faroai_csrf()]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    faroai_json(['success' => false, 'error' => 'method_not_allowed', 'message' => 'Please use POST.'], 405);
}

$raw = file_get_contents('php://input');
if (!is_string($raw) || strlen($raw) > (int) $config['max_body_bytes']) {
    faroai_json(['success' => false, 'error' => 'too_large', 'message' => 'That request is too large.'], 413);
}
$input = json_decode($raw, true);
if (!is_array($input)) {
    faroai_json(['success' => false, 'error' => 'invalid_request', 'message' => 'Invalid JSON request.'], 400);
}
faroai_require_csrf($input);

$rateDir = dirname($dbPath) . DIRECTORY_SEPARATOR . 'rate';
$limiter = new RateLimiter($rateDir);
$address = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$rateKey = $action === 'feedback' ? 'feedback:' . hash('sha256', $address) : 'chat:' . hash('sha256', $address);
$rateLimit = $action === 'feedback' ? (int) $config['feedback_rate_limit_per_minute'] : (int) $config['rate_limit_per_minute'];
if (!$limiter->allow($rateKey, $rateLimit)) {
    faroai_json(['success' => false, 'error' => 'rate_limited', 'message' => 'Too many requests. Please wait a moment.', 'csrf' => faroai_csrf()], 429);
}

try {
    if ($action === 'consent') {
        $state = [];
        foreach (['ai_chat', 'ai_improve', 'ai_training'] as $purpose) {
            $state[$purpose] = !empty($input[$purpose]);
        }
        $_SESSION['faroai_consent'] = $state;
        faroai_json(['success' => true, 'consent' => $state, 'csrf' => faroai_csrf()]);
    }

    $pdo = new PDO('sqlite:' . $dbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $store = new Store($pdo);
    $search = new ProductSearch($pdo);
    $ai = null;
    $router = $config['openrouter'] ?? [];
    if (!empty($router['api_key']) && !empty($router['model'])) {
        $ai = new OpenRouterClient((string) ($router['base_url'] ?? ''), (string) $router['api_key'], (string) $router['model'], (string) ($router['data_collection'] ?? 'deny'));
    }
    $service = new FaroAi($search, $store, $config, $ai);
    $consent = is_array($_SESSION['faroai_consent'] ?? null) ? $_SESSION['faroai_consent'] : [];

    if ($action === 'feedback') {
        $service->feedback($input, $consent);
        faroai_json(['success' => true, 'csrf' => faroai_csrf()]);
    }
    if ($action !== 'chat') {
        faroai_json(['success' => false, 'error' => 'not_found', 'message' => 'Unknown action.'], 404);
    }
    $result = $service->chat($input, $consent);
    $result['success'] = true;
    $result['csrf'] = faroai_csrf();
    faroai_json($result);
} catch (RuntimeException $error) {
    $messages = [
        'consent_required' => [403, 'Please review and accept how the assistant uses your messages.'],
        'invalid_request' => [400, 'Please send a valid request.'],
        'empty_message' => [400, 'Please type a question.'],
        'message_too_long' => [400, 'That message is too long. Please shorten it.'],
        'ai_bad_base_url' => [503, 'The AI service is not configured correctly.'],
    ];
    $code = $error->getMessage();
    [$status, $message] = $messages[$code] ?? [500, 'Something went wrong. Please try again.'];
    $safeCode = isset($messages[$code]) ? $code : 'server_error';
    faroai_json(['success' => false, 'error' => $safeCode, 'message' => $message, 'csrf' => faroai_csrf()], $status);
} catch (Throwable) {
    faroai_json(['success' => false, 'error' => 'server_error', 'message' => 'Something went wrong. Please try again.', 'csrf' => faroai_csrf()], 500);
}
