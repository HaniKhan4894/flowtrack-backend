<?php

namespace App\Libraries;

/**
 * Small symmetric cipher for storing secrets (e.g. per-org API keys) at rest.
 * AES-256-CBC with a random IV; the key is derived from an app secret so no
 * extra key management/config is required.
 */
class SecretCipher
{
    private const CIPHER = 'aes-256-cbc';

    private static function key(): string
    {
        $secret = (string) (
            env('AI_ENCRYPTION_KEY')
            ?: env('JWT_SECRET_KEY')
            ?: ($_ENV['JWT_SECRET_KEY'] ?? '')
        );

        if ($secret === '') {
            throw new \RuntimeException('No encryption secret configured (AI_ENCRYPTION_KEY or JWT_SECRET_KEY).');
        }

        // Derive a fixed 32-byte key regardless of the secret's length.
        return hash('sha256', $secret, true);
    }

    public static function encrypt(string $plaintext): string
    {
        $iv = random_bytes(16);
        $cipherText = openssl_encrypt($plaintext, self::CIPHER, self::key(), OPENSSL_RAW_DATA, $iv);

        if ($cipherText === false) {
            throw new \RuntimeException('Failed to encrypt secret.');
        }

        return base64_encode($iv . $cipherText);
    }

    public static function decrypt(?string $payload): ?string
    {
        if ($payload === null || $payload === '') {
            return null;
        }

        $raw = base64_decode($payload, true);
        if ($raw === false || strlen($raw) <= 16) {
            return null;
        }

        $iv = substr($raw, 0, 16);
        $cipherText = substr($raw, 16);
        $plaintext = openssl_decrypt($cipherText, self::CIPHER, self::key(), OPENSSL_RAW_DATA, $iv);

        return $plaintext === false ? null : $plaintext;
    }
}
