<?php

require __DIR__ . '/db.php';
require __DIR__ . '/migrations.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    if ((getenv('AUTO_MIGRATE') ?: 'false') === 'true') {
        ensure_schema();
    }

    $resource = $_GET['resource'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];

    if ($resource === 'requests') {
        handle_requests($method);
    }
    if ($resource === 'offers') {
        handle_offers($method);
    }
    if ($resource === 'vendor-request') {
        handle_vendor_request($method);
    }

    fail('Geçersiz API kaynağı.', 404);
} catch (Throwable $e) {
    fail($e->getMessage(), 500);
}

function handle_requests(string $method): void
{
    if ($method === 'GET') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $request = fetch_request($id);
            if (!$request) {
                fail('Teklif dosyası bulunamadı.', 404);
            }
            respond($request);
        }
        respond(fetch_requests());
    }

    if ($method === 'POST') {
        $data = read_json();
        save_request($data);
        respond(['ok' => true, 'id' => $data['id']]);
    }

    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? '';
        if ($id === '') {
            fail('Silmek için teklif id gerekli.');
        }
        $stmt = db()->prepare('DELETE FROM tender_requests WHERE id = ?');
        $stmt->execute([$id]);
        respond(['ok' => true]);
    }

    fail('Bu işlem desteklenmiyor.', 405);
}

function handle_offers(string $method): void
{
    if ($method === 'GET') {
        $requestId = $_GET['requestId'] ?? null;
        respond(fetch_offers($requestId));
    }

    if ($method === 'POST') {
        $data = read_json();
        save_offer($data);
        respond(['ok' => true, 'offerId' => $data['offerId']]);
    }

    if ($method === 'DELETE') {
        $requestId = $_GET['requestId'] ?? '';
        if ($requestId === '') {
            fail('Silmek için teklif dosyası id gerekli.');
        }
        $stmt = db()->prepare('DELETE FROM offers WHERE request_id = ?');
        $stmt->execute([$requestId]);
        respond(['ok' => true]);
    }

    fail('Bu işlem desteklenmiyor.', 405);
}

function handle_vendor_request(string $method): void
{
    if ($method !== 'GET') {
        fail('Bu işlem desteklenmiyor.', 405);
    }
    $id = $_GET['id'] ?? '';
    if ($id === '') {
        fail('Teklif kodu gerekli.');
    }
    $request = fetch_request($id);
    if (!$request) {
        fail('Teklif dosyası bulunamadı.', 404);
    }
    $request['owner'] = '';
    $request['pdfName'] = '';
    $request['rawText'] = '';
    $request['items'] = array_map(fn($item) => [
        'id' => $item['id'],
        'posNo' => $item['posNo'],
        'description' => $item['description'],
        'quantity' => $item['quantity'],
        'unit' => $item['unit'],
    ], $request['items']);
    respond($request);
}

function fetch_requests(): array
{
    $rows = db()->query('SELECT * FROM tender_requests ORDER BY created_at DESC')->fetchAll();
    return array_map(fn($row) => hydrate_request($row), $rows);
}

function fetch_request(string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM tender_requests WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ? hydrate_request($row) : null;
}

function hydrate_request(array $row): array
{
    $stmt = db()->prepare('SELECT * FROM request_items WHERE request_id = ? ORDER BY sort_order ASC');
    $stmt->execute([$row['id']]);
    $items = array_map(fn($item) => [
        'id' => $item['id'],
        'posNo' => $item['pos_no'] ?? '',
        'description' => $item['description'] ?? '',
        'quantity' => $item['quantity'] ?? '',
        'unit' => $item['unit'] ?? '',
        'estimatedUnitPrice' => $item['estimated_unit_price'] ?? '',
    ], $stmt->fetchAll());

    return [
        'id' => $row['id'],
        'title' => $row['title'],
        'owner' => $row['owner'] ?? '',
        'pdfName' => $row['pdf_name'] ?? '',
        'rawText' => $row['raw_text'] ?? '',
        'status' => $row['status'] ?? 'open',
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
        'items' => $items,
    ];
}

function save_request(array $data): void
{
    foreach (['id', 'title', 'items'] as $field) {
        if (!isset($data[$field])) {
            fail("Eksik alan: $field");
        }
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $upsertSql = database_driver() === 'pgsql'
            ? 'INSERT INTO tender_requests (id, title, owner, pdf_name, raw_text, status, created_at, updated_at)
               VALUES (:id, :title, :owner, :pdf_name, :raw_text, :status, :created_at, :updated_at)
               ON CONFLICT (id) DO UPDATE SET
                 title = EXCLUDED.title,
                 owner = EXCLUDED.owner,
                 pdf_name = EXCLUDED.pdf_name,
                 raw_text = EXCLUDED.raw_text,
                 status = EXCLUDED.status,
                 updated_at = EXCLUDED.updated_at'
            : 'INSERT INTO tender_requests (id, title, owner, pdf_name, raw_text, status, created_at, updated_at)
               VALUES (:id, :title, :owner, :pdf_name, :raw_text, :status, :created_at, :updated_at)
               ON DUPLICATE KEY UPDATE
                 title = VALUES(title),
                 owner = VALUES(owner),
                 pdf_name = VALUES(pdf_name),
                 raw_text = VALUES(raw_text),
                 status = VALUES(status),
                 updated_at = VALUES(updated_at)';
        $stmt = $pdo->prepare($upsertSql);
        $stmt->execute([
            ':id' => $data['id'],
            ':title' => $data['title'],
            ':owner' => $data['owner'] ?? '',
            ':pdf_name' => $data['pdfName'] ?? '',
            ':raw_text' => $data['rawText'] ?? '',
            ':status' => $data['status'] ?? 'open',
            ':created_at' => normalize_datetime($data['createdAt'] ?? null),
            ':updated_at' => normalize_datetime($data['updatedAt'] ?? null),
        ]);

        $delete = $pdo->prepare('DELETE FROM request_items WHERE request_id = ?');
        $delete->execute([$data['id']]);

        $itemStmt = $pdo->prepare(
            'INSERT INTO request_items
             (id, request_id, sort_order, pos_no, description, quantity, unit, estimated_unit_price)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach (($data['items'] ?? []) as $index => $item) {
            $itemStmt->execute([
                $item['id'],
                $data['id'],
                $index,
                $item['posNo'] ?? '',
                $item['description'] ?? '',
                $item['quantity'] ?? '',
                $item['unit'] ?? '',
                $item['estimatedUnitPrice'] ?? '',
            ]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function fetch_offers(?string $requestId = null): array
{
    if ($requestId) {
        $stmt = db()->prepare('SELECT * FROM offers WHERE request_id = ? ORDER BY submitted_at DESC');
        $stmt->execute([$requestId]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = db()->query('SELECT * FROM offers ORDER BY submitted_at DESC')->fetchAll();
    }
    return array_map(fn($row) => hydrate_offer($row), $rows);
}

function hydrate_offer(array $row): array
{
    $stmt = db()->prepare('SELECT * FROM offer_items WHERE offer_id = ?');
    $stmt->execute([$row['offer_id']]);
    $items = array_map(fn($item) => [
        'itemId' => $item['item_id'],
        'unitPrice' => (float) $item['unit_price'],
    ], $stmt->fetchAll());

    return [
        'offerId' => $row['offer_id'],
        'requestId' => $row['request_id'],
        'companyName' => $row['company_name'],
        'contactName' => $row['contact_name'] ?? '',
        'contactPhone' => $row['contact_phone'] ?? '',
        'submittedAt' => $row['submitted_at'],
        'items' => $items,
    ];
}

function save_offer(array $data): void
{
    foreach (['offerId', 'requestId', 'companyName', 'items'] as $field) {
        if (!isset($data[$field])) {
            fail("Eksik alan: $field");
        }
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO offers (offer_id, request_id, company_name, contact_name, contact_phone, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['offerId'],
            $data['requestId'],
            $data['companyName'],
            $data['contactName'] ?? '',
            $data['contactPhone'] ?? '',
            normalize_datetime($data['submittedAt'] ?? null),
        ]);

        $itemStmt = $pdo->prepare('INSERT INTO offer_items (offer_id, item_id, unit_price) VALUES (?, ?, ?)');
        foreach (($data['items'] ?? []) as $item) {
            $itemStmt->execute([
                $data['offerId'],
                $item['itemId'],
                (float) ($item['unitPrice'] ?? 0),
            ]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}
