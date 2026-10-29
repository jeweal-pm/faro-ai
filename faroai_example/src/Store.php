<?php

declare(strict_types=1);

namespace FaroAi;

use PDO;

final class Store
{
    public function __construct(private PDO $pdo)
    {
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->pdo->exec("PRAGMA busy_timeout = 2000");
        $schema = __DIR__ . '/../schema.sql';
        if (is_file($schema)) {
            $this->pdo->exec((string) file_get_contents($schema));
        }
    }

    public static function scrub(string $text): string
    {
        $text = preg_replace('/[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+/u', '[email]', $text) ?? '';
        $text = preg_replace('~\b(?:https?://|www\.)\S+~iu', '[link]', $text) ?? $text;
        $text = preg_replace('/(?<!\w)\+?\d[\d\s().\-]{6,}\d/u', '[number]', $text) ?? $text;
        $text = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $text) ?? $text;
        return mb_substr(trim((string) preg_replace('/\s+/u', ' ', $text)), 0, 300, 'UTF-8');
    }

    public function recordGap(string $text, string $reason, string $lang): void
    {
        $clean = self::scrub($text);
        if ($clean === '' || !in_array($reason, ['no_products', 'no_info', 'missing_type', 'unanswered', 'thumbs_down'], true)) {
            return;
        }
        $hash = substr(hash('sha256', mb_strtolower($clean, 'UTF-8')), 0, 40);
        $stmt = $this->pdo->prepare('SELECT id FROM faroai_gaps WHERE text_hash = ?');
        $stmt->execute([$hash]);
        if ($stmt->fetchColumn()) {
            $update = $this->pdo->prepare('UPDATE faroai_gaps SET hits = hits + 1, last_seen = CURRENT_TIMESTAMP WHERE text_hash = ?');
            $update->execute([$hash]);
        } else {
            $insert = $this->pdo->prepare('INSERT INTO faroai_gaps(text_hash,text,reason,lang) VALUES(?,?,?,?)');
            $insert->execute([$hash, $clean, $reason, in_array($lang, ['th', 'fr'], true) ? $lang : 'en']);
        }
    }

    public function purge(int $days = 90): int
    {
        $stmt = $this->pdo->prepare("DELETE FROM faroai_gaps WHERE last_seen < datetime('now', ?)");
        $stmt->execute(['-' . max(1, $days) . ' days']);
        return $stmt->rowCount();
    }

    public function recordFeedback(string $rating, string $intent, string $lang): bool
    {
        if (!in_array($rating, ['up', 'down'], true)) {
            return false;
        }
        $stmt = $this->pdo->prepare('INSERT INTO faroai_feedback(rating,intent,lang) VALUES(?,?,?)');
        return $stmt->execute([$rating, preg_match('/^[a-z]{1,12}$/', $intent) ? $intent : null, in_array($lang, ['th', 'fr'], true) ? $lang : 'en']);
    }

    /** @return array<string, array<string, string>> */
    public function synonyms(): array
    {
        $out = [];
        foreach ($this->pdo->query('SELECT phrase, filter_key, filter_value FROM faroai_synonyms') as $row) {
            $out[(string) $row['phrase']][(string) $row['filter_key']] = (string) $row['filter_value'];
        }
        return $out;
    }

    public function setSynonym(string $phrase, string $key, string $value): bool
    {
        $phrase = mb_strtolower(trim($phrase), 'UTF-8');
        if ($phrase === '' || mb_strlen($phrase, 'UTF-8') > 60 || !in_array($key, ['product_type', 'metal_color', 'stone_type', 'stone_shape'], true) || !preg_match('/^[a-z][a-z \-]{1,39}$/', $value)) {
            return false;
        }
        $stmt = $this->pdo->prepare('INSERT INTO faroai_synonyms(phrase,filter_key,filter_value) VALUES(?,?,?) ON CONFLICT(phrase) DO UPDATE SET filter_key=excluded.filter_key, filter_value=excluded.filter_value');
        return $stmt->execute([$phrase, $key, strtolower($value)]);
    }

    public function removeSynonym(string $phrase): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM faroai_synonyms WHERE phrase = ?');
        $stmt->execute([mb_strtolower(trim($phrase), 'UTF-8')]);
        return $stmt->rowCount() > 0;
    }

    /** @return list<array{title:string,detail:string,language:string}> */
    public function faqRows(): array
    {
        $rows = $this->pdo->query('SELECT title, detail, language FROM faq_items WHERE status = 1 ORDER BY sequence ASC')->fetchAll();
        return array_map(static fn (array $row): array => [
            'title' => self::cleanText((string) $row['title'], 200),
            'detail' => self::cleanText((string) $row['detail'], 1200),
            'language' => strtolower((string) $row['language']),
        ], $rows);
    }

    /** @return list<array{title:string,content:string,slug:string,language:string}> */
    public function siteRows(): array
    {
        $rows = $this->pdo->query('SELECT slug, title, content, language FROM site_content WHERE status = 1')->fetchAll();
        return array_map(static fn (array $row): array => [
            'slug' => (string) $row['slug'],
            'title' => self::cleanText((string) $row['title'], 120),
            'content' => self::cleanText((string) $row['content'], 1400),
            'language' => strtolower((string) $row['language']),
        ], $rows);
    }

    private static function cleanText(string $text, int $max): string
    {
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = str_replace(['<', '>'], ' ', $text);
        $text = preg_replace('/\b(?:ignore|disregard|forget)\b[^.]{0,40}\b(?:instruction|prompt|rule)s?\b/i', '[removed]', $text) ?? $text;
        return mb_substr(trim((string) preg_replace('/\s+/u', ' ', $text)), 0, $max, 'UTF-8');
    }
}
