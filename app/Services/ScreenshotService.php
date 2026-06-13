<?php

namespace App\Services;

use App\Models\ScreenshotModel;
use App\Services\TimezoneService;

class ScreenshotService
{
    protected $screenshotModel;
    protected $timezoneService;
    protected $db;
    protected $uploadPath = WRITEPATH . 'uploads/screenshots/';

    public function __construct()
    {
        $this->screenshotModel = new ScreenshotModel();
        $this->timezoneService = new TimezoneService();
        $this->db = \Config\Database::connect();
        
        // Create upload directory if not exists
        if (!is_dir($this->uploadPath)) {
            mkdir($this->uploadPath, 0755, true);
        }
    }

    public function saveScreenshot(int $timeEntryId, int $userId, $file, array $data = []): array
    {
        // Validate file
        if (!$file->isValid()) {
            throw new \Exception('Invalid file upload');
        }

        $allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        $mimeType = $file->getMimeType();
        if (!in_array($mimeType, $allowedMimeTypes, true)) {
            throw new \Exception('Unsupported screenshot file type');
        }

        $maxBytes = 5 * 1024 * 1024;
        if ($file->getSize() > $maxBytes) {
            throw new \Exception('Screenshot exceeds 5MB limit');
        }

        // Generate unique filename
        $extension = $file->guessExtension() ?: 'jpg';
        $filename = uniqid('', true) . '_' . time() . '.' . $extension;
        $datePath = date('Y/m/d/');
        $fullPath = $this->uploadPath . $datePath;

        // Create directory structure
        if (!is_dir($fullPath)) {
            mkdir($fullPath, 0755, true);
        }

        // Move file
        $file->move($fullPath, $filename);

        // Generate UUID manually since we bypass Model callbacks
        $uuid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );

        $insertData = [
            'uuid'            => $uuid,
            'time_entry_id'   => (int)$timeEntryId,
            'user_id'         => (int)$userId,
            'file_path'       => $datePath . $filename,
            'thumbnail_path'  => null,
            'is_blurred'      => (bool)($data['is_blurred'] ?? false),
            'activity_level'  => (int)($data['activity_level'] ?? 0),
            'captured_at'     => date('Y-m-d H:i:s'),
            'created_at'      => date('Y-m-d H:i:s'),
            'deleted_by_user' => 0,
        ];
 
        $this->screenshotModel->builder()->insert($insertData);
        $screenshotId = $this->db->insertID();

        return $this->screenshotModel->find($screenshotId);
    }

    public function getScreenshot(int $id): ?array
    {
        return $this->screenshotModel->find($id);
    }

    public function getScreenshotsByTimeEntry(int $timeEntryId): array
    {
        return $this->screenshotModel
            ->where('time_entry_id', $timeEntryId)
            ->where('deleted_by_user', false)
            ->orderBy('captured_at', 'ASC')
            ->findAll();
    }

    public function deleteScreenshot(int $id, int $userId): bool
    {
        $screenshot = $this->screenshotModel->find($id);

        if (!$screenshot || $screenshot['user_id'] != $userId) {
            throw new \Exception('Screenshot not found or unauthorized');
        }

        // Mark as deleted (soft delete)
        return $this->screenshotModel->update($id, ['deleted_by_user' => true]);
    }

    public function getScreenshots(array $filters): array
    {
        $builder = $this->screenshotModel->builder();

        if (isset($filters['user_id'])) {
            $builder->where('user_id', $filters['user_id']);
        }

        if (isset($filters['time_entry_id'])) {
            $builder->where('time_entry_id', $filters['time_entry_id']);
        }

        if (isset($filters['start_date']) || isset($filters['end_date'])) {
            $orgId = (int) ($filters['organization_id'] ?? 0);
            $phpTz = $this->timezoneService->getOrgTimezone($orgId);
            if (isset($filters['start_date'])) {
                $startUtc = $this->timezoneService->dateRangeUtc($filters['start_date'], $filters['start_date'], $phpTz)[0];
                $builder->where('captured_at >=', $startUtc);
            }
            if (isset($filters['end_date'])) {
                $endUtc = $this->timezoneService->dateRangeUtc($filters['end_date'], $filters['end_date'], $phpTz)[1];
                $builder->where('captured_at <=', $endUtc);
            }
        }

        $builder->where('deleted_by_user', false);

        $page = $filters['page'] ?? 1;
        $perPage = $filters['per_page'] ?? 20;
        $offset = ($page - 1) * $perPage;

        $total = $builder->countAllResults(false);
        $screenshots = $builder->orderBy('captured_at', 'DESC')->limit($perPage, $offset)->get()->getResultArray();
        $phpTz = $this->timezoneService->getOrgTimezone((int) ($filters['organization_id'] ?? 0));
        $screenshots = $this->timezoneService->applyToCollection($screenshots, $phpTz, ['captured_at', 'created_at']);

        return [
            'data' => $screenshots,
            'pagination' => [
                'current_page' => (int)$page,
                'per_page' => (int)$perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage)
            ]
        ];
    }
}
