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

        $relativePath = $datePath . $filename;
        $absolutePath = $fullPath . $filename;

        if (!empty($data['apply_blur'])) {
            $this->blurImage($absolutePath);
        }

        $thumbnailPath = $this->generateThumbnail($absolutePath, $relativePath);

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
            'file_path'       => $relativePath,
            'thumbnail_path'  => $thumbnailPath,
            'is_blurred'      => (bool)($data['is_blurred'] ?? $data['apply_blur'] ?? false),
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

    public function blurImage(string $absolutePath): bool
    {
        if (!file_exists($absolutePath) || !function_exists('imagecreatefromstring')) {
            return false;
        }

        $contents = file_get_contents($absolutePath);
        if ($contents === false) {
            return false;
        }

        $image = @imagecreatefromstring($contents);
        if (!$image) {
            return false;
        }

        $width = imagesx($image);
        $height = imagesy($image);

        for ($i = 0; $i < 3; $i++) {
            imagefilter($image, IMG_FILTER_GAUSSIAN_BLUR);
        }

        $mime = mime_content_type($absolutePath) ?: 'image/jpeg';
        $saved = match ($mime) {
            'image/png' => imagepng($image, $absolutePath),
            'image/webp' => function_exists('imagewebp') ? imagewebp($image, $absolutePath, 80) : imagejpeg($image, $absolutePath, 85),
            default => imagejpeg($image, $absolutePath, 85),
        };

        imagedestroy($image);

        return (bool) $saved;
    }

    public function resolveFilePath(array $screenshot, bool $thumbnail = false): string
    {
        if ($thumbnail) {
            $thumbPath = $this->ensureThumbnail($screenshot);
            if ($thumbPath !== null) {
                return $thumbPath;
            }
        }

        return (string) ($screenshot['file_path'] ?? '');
    }

    public function canViewScreenshot(int $viewerId, int $organizationId, array $screenshot): bool
    {
        if ((int) ($screenshot['user_id'] ?? 0) === $viewerId) {
            return true;
        }

        $permissionService = new PermissionService();
        if (!$permissionService->userHasPermission($viewerId, $organizationId, 'screenshots.view_team')) {
            return false;
        }

        $teamScopeService = new TeamScopeService();

        return $teamScopeService->canViewUser($viewerId, $organizationId, (int) $screenshot['user_id']);
    }

    private function ensureThumbnail(array $screenshot): ?string
    {
        $existing = trim((string) ($screenshot['thumbnail_path'] ?? ''));
        if ($existing !== '' && file_exists($this->uploadPath . $existing)) {
            return $existing;
        }

        $source = $this->uploadPath . ($screenshot['file_path'] ?? '');
        if (!is_file($source)) {
            return null;
        }

        $thumbRelative = $this->generateThumbnail($source, (string) ($screenshot['file_path'] ?? ''));
        if ($thumbRelative === null) {
            return null;
        }

        $this->screenshotModel->update((int) $screenshot['id'], ['thumbnail_path' => $thumbRelative]);

        return $thumbRelative;
    }

    private function generateThumbnail(string $absolutePath, ?string $relativePath = null): ?string
    {
        if (!function_exists('imagecreatefromstring')) {
            return null;
        }

        $contents = file_get_contents($absolutePath);
        if ($contents === false) {
            return null;
        }

        $image = @imagecreatefromstring($contents);
        if (!$image) {
            return null;
        }

        $width = imagesx($image);
        $height = imagesy($image);
        if ($width <= 0 || $height <= 0) {
            imagedestroy($image);
            return null;
        }

        $thumbWidth = 320;
        $thumbHeight = max(1, (int) round($height * ($thumbWidth / $width)));

        $thumb = imagecreatetruecolor($thumbWidth, $thumbHeight);
        imagecopyresampled($thumb, $image, 0, 0, 0, 0, $thumbWidth, $thumbHeight, $width, $height);

        $thumbRelative = $relativePath
            ? preg_replace('/\.[^.]+$/', '_thumb.jpg', $relativePath)
            : pathinfo($absolutePath, PATHINFO_FILENAME) . '_thumb.jpg';
        $thumbAbsolute = $this->uploadPath . $thumbRelative;

        $thumbDir = dirname($thumbAbsolute);
        if (!is_dir($thumbDir)) {
            mkdir($thumbDir, 0755, true);
        }

        $saved = imagejpeg($thumb, $thumbAbsolute, 55);

        imagedestroy($image);
        imagedestroy($thumb);

        return $saved ? $thumbRelative : null;
    }
}
