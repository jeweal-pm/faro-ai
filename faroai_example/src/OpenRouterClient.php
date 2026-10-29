<?php

declare(strict_types=1);

namespace FaroAi;

use RuntimeException;

final class OpenRouterClient
{
    public function __construct(
        private string $baseUrl,
        private string $apiKey,
        private string $model,
        private string $dataCollection = 'deny'
    ) {
        $this->baseUrl = rtrim($baseUrl, '/');
        if (!self::allowedBaseUrl($this->baseUrl)) {
            throw new RuntimeException('ai_bad_base_url');
        }
    }

    public static function allowedBaseUrl(string $url): bool
    {
        return (bool) preg_match('#^https://[A-Za-z0-9.\-]+(?::\d+)?(?:/[^\s]*)?$#', $url)
            || (bool) preg_match('#^http://(?:127\.0\.0\.1|localhost)(?::\d+)?(?:/[^\s]*)?$#', $url);
    }

    public function chat(array $messages, int $timeout = 30): string
    {
        $payload = [
            'model' => $this->model,
            'messages' => $messages,
            'temperature' => 0.3,
            'max_tokens' => 600,
        ];
        if (in_array($this->dataCollection, ['deny', 'allow'], true)) {
            $payload['provider'] = ['data_collection' => $this->dataCollection];
        }
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $ch = curl_init($this->baseUrl . '/chat/completions');
        if ($ch === false) {
            throw new RuntimeException('ai_transport_failed');
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $this->apiKey,
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Title: FaroAI',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => max(3, $timeout),
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($raw === false || $status < 200 || $status >= 300) {
            throw new RuntimeException('ai_provider_failed');
        }
        $data = json_decode((string) $raw, true);
        $text = $data['choices'][0]['message']['content'] ?? null;
        if (!is_string($text) || trim($text) === '') {
            throw new RuntimeException('ai_empty_response');
        }
        return trim($text);
    }
}
