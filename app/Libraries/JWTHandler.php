<?php

namespace App\Libraries;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Exception;

class JWTHandler
{
    private $secretKey;
    private $algorithm = 'HS256';

    public function __construct()
    {
        // Resolve secret from CI env first, then PHP env fallbacks.
        // In some server setups DotEnv values are available in $_ENV/$_SERVER
        // but not via getenv(), so we intentionally check all locations.
        $this->secretKey = (string) (
            env('JWT_SECRET_KEY')
            ?? getenv('JWT_SECRET_KEY')
            ?? ($_ENV['JWT_SECRET_KEY'] ?? null)
            ?? ($_SERVER['JWT_SECRET_KEY'] ?? '')
        );
        if ($this->secretKey === '') {
            throw new \RuntimeException('JWT_SECRET_KEY is not configured');
        }
    }

    /**
     * Generate JWT access token
     * 
     * @param array $payload User data to encode
     * @param int $expiresIn Expiration time in seconds (default: 15 minutes)
     * @return string JWT token
     */
    public function generateAccessToken(array $payload, int $expiresIn = 900): string
    {
        $issuedAt = time();
        $expire = $issuedAt + $expiresIn;

        $tokenPayload = [
            'iat' => $issuedAt,
            'exp' => $expire,
            'data' => $payload
        ];

        return JWT::encode($tokenPayload, $this->secretKey, $this->algorithm);
    }

    /**
     * Generate JWT refresh token
     * 
     * @param array $payload User data to encode
     * @param int $expiresIn Expiration time in seconds (default: 30 days)
     * @return string JWT token
     */
    public function generateRefreshToken(array $payload, int $expiresIn = 2592000): string
    {
        $issuedAt = time();
        $expire = $issuedAt + $expiresIn;

        $tokenPayload = [
            'iat' => $issuedAt,
            'exp' => $expire,
            'type' => 'refresh',
            'data' => $payload
        ];

        return JWT::encode($tokenPayload, $this->secretKey, $this->algorithm);
    }

    /**
     * Verify and decode JWT token
     * 
     * @param string $token JWT token to verify
     * @return object|null Decoded token data or null if invalid
     */
    public function verifyToken(string $token): ?object
    {
        try {
            $decoded = JWT::decode($token, new Key($this->secretKey, $this->algorithm));
            return $decoded;
        } catch (Exception $e) {
            log_message('error', 'JWT verification failed: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Get user data from token
     * 
     * @param string $token JWT token
     * @return array|null User data or null if invalid
     */
    public function getUserFromToken(string $token): ?array
    {
        $decoded = $this->verifyToken($token);
        
        if ($decoded && isset($decoded->data)) {
            return (array) $decoded->data;
        }

        return null;
    }

    /**
     * Check if token is expired
     * 
     * @param string $token JWT token
     * @return bool True if expired, false otherwise
     */
    public function isTokenExpired(string $token): bool
    {
        $decoded = $this->verifyToken($token);
        
        if (!$decoded) {
            return true;
        }

        return isset($decoded->exp) && $decoded->exp < time();
    }

    /**
     * Extract token from Authorization header
     * 
     * @param string|null $authHeader Authorization header value
     * @return string|null Token or null if not found
     */
    public function extractTokenFromHeader(?string $authHeader): ?string
    {
        if (!$authHeader) {
            return null;
        }

        // Bearer token format: "Bearer <token>"
        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            return $matches[1];
        }

        return null;
    }
}
