<?php

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = database_config();
    $pdo = new PDO($config['dsn'], $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function database_driver(): string
{
    return database_config()['driver'];
}

function database_config(): array
{
    static $resolved = null;
    if ($resolved !== null) {
        return $resolved;
    }

    $url = getenv('DATABASE_URL') ?: '';
    if ($url !== '') {
        $parts = parse_url($url);
        if ($parts === false || !isset($parts['scheme'], $parts['host'], $parts['path'])) {
            throw new RuntimeException('DATABASE_URL geçersiz.');
        }

        $scheme = str_replace('postgresql', 'pgsql', $parts['scheme']);
        $driver = $scheme === 'postgres' ? 'pgsql' : $scheme;
        $database = ltrim($parts['path'], '/');
        $port = $parts['port'] ?? ($driver === 'pgsql' ? 5432 : 3306);
        $username = rawurldecode($parts['user'] ?? '');
        $password = rawurldecode($parts['pass'] ?? '');

        if ($driver === 'pgsql') {
            $sslmode = getenv('DB_SSLMODE') ?: 'require';
            $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s;sslmode=%s', $parts['host'], $port, $database, $sslmode);
        } elseif ($driver === 'mysql') {
            $charset = getenv('DB_CHARSET') ?: 'utf8mb4';
            $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', $parts['host'], $port, $database, $charset);
        } else {
            throw new RuntimeException('Desteklenmeyen DATABASE_URL sürücüsü: ' . $driver);
        }

        $resolved = compact('driver', 'dsn', 'username', 'password');
        return $resolved;
    }

    $fileConfig = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
    $driver = getenv('DB_DRIVER') ?: ($fileConfig['driver'] ?? 'mysql');
    $host = getenv('DB_HOST') ?: ($fileConfig['host'] ?? 'localhost');
    $database = getenv('DB_DATABASE') ?: ($fileConfig['database'] ?? 'teklif');
    $username = getenv('DB_USERNAME') ?: ($fileConfig['username'] ?? '');
    $password = getenv('DB_PASSWORD') ?: ($fileConfig['password'] ?? '');
    $port = getenv('DB_PORT') ?: ($driver === 'pgsql' ? 5432 : 3306);

    if ($driver === 'pgsql') {
        $sslmode = getenv('DB_SSLMODE') ?: ($fileConfig['sslmode'] ?? 'prefer');
        $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s;sslmode=%s', $host, $port, $database, $sslmode);
    } else {
        $charset = getenv('DB_CHARSET') ?: ($fileConfig['charset'] ?? 'utf8mb4');
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', $host, $port, $database, $charset);
        $driver = 'mysql';
    }

    $resolved = compact('driver', 'dsn', 'username', 'password');
    return $resolved;
}

function read_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException('Geçersiz JSON gövdesi.');
    }
    return $data;
}

function respond($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $status = 400): void
{
    respond(['error' => $message], $status);
}

function normalize_datetime(?string $value): string
{
    if (!$value) {
        return date('Y-m-d H:i:s');
    }
    $time = strtotime($value);
    return date('Y-m-d H:i:s', $time ?: time());
}
