<?php

declare(strict_types=1);

/**
 * Framework-independent configuration.
 * Secrets are read from environment variables only. Do not replace the API key with a literal value here.
 */
return [
    'db_path' => getenv('FAROAI_DB_PATH') ?: __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'faroai.sqlite',
    'product_base_url' => rtrim((string) (getenv('FAROAI_PRODUCT_BASE_URL') ?: ''), '/'),
    'openrouter' => [
        'base_url' => rtrim((string) (getenv('OPENROUTER_BASE_URL') ?: 'https://openrouter.ai/api/v1'), '/'),
        'api_key' => (string) (getenv('OPENROUTER_API_KEY') ?: ''),
        'model' => (string) (getenv('OPENROUTER_MODEL') ?: ''),
        'data_collection' => strtolower((string) (getenv('OPENROUTER_DATA_COLLECTION') ?: 'deny')),
    ],
    'fx_to_usd' => [
        'USD' => 1.0,
        'THB' => (float) (getenv('FAROAI_FX_THB') ?: 0.029),
        'EUR' => (float) (getenv('FAROAI_FX_EUR') ?: 1.10),
        'GBP' => (float) (getenv('FAROAI_FX_GBP') ?: 1.30),
        'MUR' => (float) (getenv('FAROAI_FX_MUR') ?: 0.022),
    ],
    'top_k' => max(1, min(10, (int) (getenv('FAROAI_TOP_K') ?: 6))),
    'max_message_chars' => 500,
    'max_history' => 8,
    'max_history_chars' => 1500,
    'max_body_bytes' => 32768,
    'rate_limit_per_minute' => 15,
    'feedback_rate_limit_per_minute' => 30,
    'retention_days' => 90,
    'category_slugs' => [
        'ring' => 'rings',
        'earring' => 'earrings',
        'pendant' => 'pendant',
        'bracelet' => 'bracelets',
        'anklet' => 'anklet',
    ],
];
