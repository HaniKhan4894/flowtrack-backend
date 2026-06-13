<?php

namespace App\Controllers\API\V1;

use CodeIgniter\RESTful\ResourceController;
use App\Services\ClientService;

class ClientController extends ResourceController
{
    protected ClientService $clientService;
    protected $format = 'json';

    public function __construct()
    {
        $this->clientService = new ClientService();
    }

    private function requireOrganizationId()
    {
        $organizationId = (int)($this->request->getServer('FLOWTRACK_ORGANIZATION_ID') ?? 0);
        if ($organizationId <= 0) {
            return $this->fail('Organization context is required', 400);
        }
        return $organizationId;
    }

    public function index()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $filters = [
                'is_active' => $this->request->getGet('is_active'),
                'search' => $this->request->getGet('search'),
                'page' => $this->request->getGet('page') ?? 1,
                'per_page' => $this->request->getGet('per_page') ?? 20,
            ];
            $filters = array_filter($filters, fn ($v) => $v !== null && $v !== '');

            $result = $this->clientService->getClients($organizationId, $filters);

            return $this->respond([
                'success' => true,
                'data' => $result['data'],
                'pagination' => $result['pagination'],
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function show($id = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $client = $this->clientService->getClient((int) $id, $organizationId);
            if (!$client) {
                return $this->failNotFound('Client not found');
            }

            return $this->respond(['success' => true, 'data' => $client]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function create()
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true);
            if (!$this->validate(['name' => 'required|max_length[255]'])) {
                return $this->failValidationErrors($this->validator->getErrors());
            }

            $client = $this->clientService->createClient($organizationId, $data);

            return $this->respondCreated([
                'success' => true,
                'message' => 'Client created successfully',
                'data' => $client,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function update($id = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true);
            $client = $this->clientService->updateClient((int) $id, $organizationId, $data);

            return $this->respond([
                'success' => true,
                'message' => 'Client updated successfully',
                'data' => $client,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function delete($id = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $this->clientService->deleteClient((int) $id, $organizationId);

            return $this->respondDeleted([
                'success' => true,
                'message' => 'Client deleted successfully',
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }

    public function linkProjects($id = null)
    {
        try {
            $organizationId = $this->requireOrganizationId();
            if (!is_int($organizationId)) {
                return $organizationId;
            }

            $data = $this->request->getJSON(true);
            if (empty($data['project_ids']) || !is_array($data['project_ids'])) {
                return $this->fail('project_ids array is required', 400);
            }

            $client = $this->clientService->linkProjects((int) $id, $organizationId, $data['project_ids']);

            return $this->respond([
                'success' => true,
                'message' => 'Projects linked successfully',
                'data' => $client,
            ]);
        } catch (\Exception $e) {
            return $this->fail($e->getMessage(), 400);
        }
    }
}
