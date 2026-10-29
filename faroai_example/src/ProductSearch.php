<?php

declare(strict_types=1);

namespace FaroAi;

use PDO;

final class ProductSearch
{
    private const FILTER_KEYS = ['product_type', 'metal_color', 'metal_karat', 'stone_type', 'stone_shape', 'carat_min', 'carat_max', 'price_min', 'price_max'];

    public function __construct(private PDO $pdo)
    {
        $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $schema = __DIR__ . '/../schema.sql';
        if (is_file($schema)) {
            $this->pdo->exec((string) file_get_contents($schema));
        }
    }

    /** @return array<string, list<string>> */
    public function vocabulary(): array
    {
        $pick = function (string $key): array {
            $queries = [
                'product_type' => "SELECT DISTINCT lower(product_type) FROM products WHERE product_type IS NOT NULL AND product_type <> ''",
                'metal_color' => "SELECT DISTINCT lower(metal_color) FROM products WHERE metal_color IS NOT NULL AND metal_color <> ''",
                'metal_karat' => "SELECT DISTINCT lower(metal_karat) FROM products WHERE metal_karat IS NOT NULL AND metal_karat <> ''",
                'stone_type' => "SELECT DISTINCT lower(stone_type) FROM products WHERE stone_type IS NOT NULL AND stone_type <> ''",
                'stone_shape' => "SELECT DISTINCT lower(stone_shape) FROM products WHERE stone_shape IS NOT NULL AND stone_shape <> ''",
            ];
            if (!isset($queries[$key])) {
                return [];
            }
            $stmt = $this->pdo->query($queries[$key]);
            return array_values(array_filter(array_map(static fn ($v): string => trim((string) $v), $stmt->fetchAll(PDO::FETCH_COLUMN))));
        };
        return [
            'product_type' => $pick('product_type'),
            'metal_color' => $pick('metal_color'),
            'metal_karat' => array_map('strtoupper', $pick('metal_karat')),
            'stone_type' => $pick('stone_type'),
            'stone_shape' => $pick('stone_shape'),
        ];
    }

    /** @param mixed $input */
    public function sanitizeFilters(mixed $input): array
    {
        if (!is_array($input)) {
            return [];
        }
        $vocab = $this->vocabulary();
        $out = [];
        foreach (['product_type', 'metal_color', 'stone_type', 'stone_shape'] as $key) {
            if (isset($input[$key]) && is_string($input[$key])) {
                $value = strtolower(trim($input[$key]));
                if ($value !== '' && in_array($value, $vocab[$key], true)) {
                    $out[$key] = $value;
                }
            }
        }
        if (isset($input['metal_karat'])) {
            $value = strtoupper(trim((string) $input['metal_karat']));
            if (preg_match('/^\d{1,2}$/', $value)) {
                $value .= 'K';
            }
            if (in_array($value, $vocab['metal_karat'], true)) {
                $out['metal_karat'] = $value;
            }
        }
        foreach (['product_types' => 3, '_last' => 12, '_seen' => 60] as $key => $max) {
            if (!isset($input[$key]) || !is_array($input[$key])) {
                continue;
            }
            $values = [];
            foreach (array_slice($input[$key], 0, $max) as $value) {
                $value = is_string($value) ? trim($value) : '';
                if ($key === 'product_types' && in_array(strtolower($value), $vocab['product_type'], true)) {
                    $values[strtolower($value)] = true;
                } elseif ($key !== 'product_types' && preg_match('/^[A-Za-z0-9\-]{3,40}$/', $value)) {
                    $values[$value] = true;
                }
            }
            if ($key === 'product_types' && count($values) >= 2) {
                $out[$key] = array_keys($values);
            } elseif ($key !== 'product_types' && $values) {
                $out[$key] = array_keys($values);
            }
        }
        if (isset($input['sort']) && in_array($input['sort'], ['price_asc', 'price_desc', 'carat_asc', 'carat_desc', 'weight_asc', 'weight_desc', 'new'], true)) {
            $out['sort'] = $input['sort'];
        }
        foreach (['carat_min' => 100.0, 'carat_max' => 100.0, 'price_min' => 10000000.0, 'price_max' => 10000000.0] as $key => $max) {
            if (isset($input[$key]) && is_numeric($input[$key]) && (float) $input[$key] >= 0 && (float) $input[$key] <= $max) {
                $out[$key] = round((float) $input[$key], 3);
            }
        }
        foreach ([['carat_min', 'carat_max'], ['price_min', 'price_max']] as [$min, $max]) {
            if (isset($out[$min], $out[$max]) && $out[$min] > $out[$max]) {
                [$out[$min], $out[$max]] = [$out[$max], $out[$min]];
            }
        }
        return $out;
    }

    /** @return array{products:list<array<string,mixed>>,candidates:int,nearby:array<string,int>} */
    public function search(array $filters, string $query, int $limit = 6, array $options = []): array
    {
        $where = [];
        $params = [];
        $map = ['product_type' => 'product_type', 'metal_color' => 'metal_color', 'metal_karat' => 'metal_karat', 'stone_type' => 'stone_type', 'stone_shape' => 'stone_shape'];
        foreach ($map as $filter => $column) {
            if (isset($filters[$filter])) {
                $where[] = "lower($column) = lower(?)";
                $params[] = $filters[$filter];
            }
        }
        foreach ([['carat_min', 'stone_carat', '>='], ['carat_max', 'stone_carat', '<='], ['price_min', 'price', '>='], ['price_max', 'price', '<=']] as [$filter, $column, $operator]) {
            if (isset($filters[$filter])) {
                $where[] = "$column $operator ?";
                $params[] = $filters[$filter];
            }
        }
        $types = isset($filters['product_types']) && is_array($filters['product_types']) ? $filters['product_types'] : [];
        if ($types) {
            $where[] = 'lower(product_type) IN (' . implode(',', array_fill(0, count($types), '?')) . ')';
            $params = array_merge($params, $types);
        }
        $exclude = array_values(array_filter((array) ($options['exclude'] ?? []), static fn ($v): bool => is_string($v) && preg_match('/^[A-Za-z0-9\-]{3,40}$/', $v)));
        if ($exclude) {
            $where[] = 'sku NOT IN (' . implode(',', array_fill(0, count($exclude), '?')) . ')';
            $params = array_merge($params, $exclude);
        }
        $sql = 'SELECT * FROM products' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' LIMIT 400';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $terms = array_values(array_filter(preg_split('/[^\p{L}\p{N}]+/u', strtolower($query)) ?: [], static fn ($v): bool => mb_strlen((string) $v, 'UTF-8') >= 2));
        $ranked = [];
        foreach ($rows as $row) {
            $haystack = strtolower(implode(' ', [(string) ($row['name'] ?? ''), (string) ($row['search_text'] ?? ''), (string) ($row['summary'] ?? ''), (string) ($row['stone_type'] ?? '')]));
            $hits = 0;
            foreach ($terms as $term) {
                $hits += substr_count($haystack, $term);
            }
            $score = min(1.0, 0.15 + ($hits * 0.12));
            if (isset($filters['carat_min'], $filters['carat_max']) && $row['stone_carat'] !== null) {
                $mid = ((float) $filters['carat_min'] + (float) $filters['carat_max']) / 2;
                $score += max(0, 0.35 - abs((float) $row['stone_carat'] - $mid) * 0.35);
            }
            $ranked[] = ['row' => $row, 'score' => $score];
        }
        usort($ranked, static fn (array $a, array $b): int => $b['score'] <=> $a['score']);
        if (isset($filters['sort'])) {
            $column = ['price_asc' => 'price', 'price_desc' => 'price', 'carat_asc' => 'stone_carat', 'carat_desc' => 'stone_carat', 'weight_asc' => 'weight', 'weight_desc' => 'weight', 'new' => 'id'][$filters['sort']] ?? null;
            if ($column !== null) {
                $direction = in_array($filters['sort'], ['price_desc', 'carat_desc', 'weight_desc', 'new'], true) ? -1 : 1;
                usort($ranked, static function (array $a, array $b) use ($column, $direction): int {
                    $av = $a['row'][$column] ?? null;
                    $bv = $b['row'][$column] ?? null;
                    if ($av === $bv) {
                        return 0;
                    }
                    if ($av === null) {
                        return 1;
                    }
                    if ($bv === null) {
                        return -1;
                    }
                    return $direction * ($av <=> $bv);
                });
            }
        }
        $products = [];
        foreach (array_slice($ranked, 0, max(1, min(10, $limit))) as $item) {
            $products[] = $this->shape($item['row'], (float) $item['score']);
        }
        return ['products' => $products, 'candidates' => count($rows), 'nearby' => []];
    }

    /** @return array{products:list<array<string,mixed>>,missing:list<string>} */
    public function bySku(array $skus): array
    {
        $skus = array_values(array_filter(array_slice($skus, 0, 6), static fn ($v): bool => is_string($v) && preg_match('/^[A-Za-z0-9\-]{3,40}$/', $v)));
        if (!$skus) {
            return ['products' => [], 'missing' => []];
        }
        $stmt = $this->pdo->prepare('SELECT * FROM products WHERE upper(sku) IN (' . implode(',', array_fill(0, count($skus), '?')) . ')');
        $stmt->execute(array_map('strtoupper', $skus));
        $found = [];
        foreach ($stmt->fetchAll() as $row) {
            $found[strtoupper((string) $row['sku'])] = $this->shape($row, 1.0);
        }
        $products = [];
        $missing = [];
        foreach ($skus as $sku) {
            if (isset($found[strtoupper($sku)])) {
                $products[] = $found[strtoupper($sku)];
            } else {
                $missing[] = $sku;
            }
        }
        return ['products' => $products, 'missing' => $missing];
    }

    /** @return array<string,mixed> */
    private function shape(array $row, float $score): array
    {
        return [
            'id' => (int) ($row['id'] ?? 0),
            'sku' => (string) ($row['sku'] ?? ''),
            'name' => (string) ($row['name'] ?? ''),
            'path' => (string) ($row['path'] ?? ''),
            'image' => (string) ($row['image'] ?? ''),
            'productType' => (string) ($row['product_type'] ?? ''),
            'metal' => (string) ($row['metal'] ?? ''),
            'stoneType' => (string) ($row['stone_type'] ?? ''),
            'stoneShape' => (string) ($row['stone_shape'] ?? ''),
            'stoneCarat' => $row['stone_carat'] === null ? null : (float) $row['stone_carat'],
            'price' => $row['price'] === null ? null : (float) $row['price'],
            'currency' => (string) ($row['currency'] ?? 'USD'),
            'weight' => $row['weight'] === null ? null : (float) $row['weight'],
            'summary' => (string) ($row['summary'] ?? ''),
            'score' => round($score, 4),
        ];
    }
}
