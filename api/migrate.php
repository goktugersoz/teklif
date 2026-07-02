<?php

require __DIR__ . '/db.php';
require __DIR__ . '/migrations.php';

try {
    $token = getenv('MIGRATION_TOKEN') ?: '';
    if ($token !== '' && ($_GET['token'] ?? '') !== $token) {
        fail('Migration token hatalı.', 403);
    }

    ensure_schema();
    respond([
        'ok' => true,
        'driver' => database_driver(),
        'message' => 'Veritabanı şeması hazır.',
    ]);
} catch (Throwable $e) {
    fail($e->getMessage(), 500);
}
