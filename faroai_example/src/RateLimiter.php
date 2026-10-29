<?php

declare(strict_types=1);

namespace FaroAi;

/** Small single-node limiter for the standalone reference endpoint. Use Redis/API-gateway storage in a cluster. */
final class RateLimiter
{
    public function __construct(private string $directory)
    {
        if (!is_dir($directory)) {
            @mkdir($directory, 0700, true);
        }
    }

    public function allow(string $key, int $limit, int $windowSeconds = 60): bool
    {
        $file = rtrim($this->directory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'rate-' . hash('sha256', $key) . '.json';
        $handle = @fopen($file, 'c+');
        if ($handle === false) {
            return false;
        }
        try {
            if (!flock($handle, LOCK_EX)) {
                return false;
            }
            $raw = stream_get_contents($handle);
            $bucket = json_decode($raw ?: '', true);
            $now = time();
            if (!is_array($bucket) || !isset($bucket['started'], $bucket['count']) || $now - (int) $bucket['started'] >= $windowSeconds) {
                $bucket = ['started' => $now, 'count' => 0];
            }
            $allowed = (int) $bucket['count'] < max(1, $limit);
            if ($allowed) {
                $bucket['count']++;
                ftruncate($handle, 0);
                rewind($handle);
                fwrite($handle, json_encode($bucket, JSON_THROW_ON_ERROR));
                fflush($handle);
            }
            flock($handle, LOCK_UN);
            return $allowed;
        } catch (\Throwable) {
            return false;
        } finally {
            fclose($handle);
        }
    }
}
