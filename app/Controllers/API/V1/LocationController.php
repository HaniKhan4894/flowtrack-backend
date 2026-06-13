<?php

namespace App\Controllers\API\V1;

use App\Services\LocationService;
use CodeIgniter\RESTful\ResourceController;

class LocationController extends ResourceController
{
    protected LocationService $locationService;
    protected $format = 'json';

    public function __construct()
    {
        $this->locationService = new LocationService();
    }

    public function countries()
    {
        return $this->respond([
            'success' => true,
            'data' => $this->locationService->getCountries(),
        ]);
    }

    public function states()
    {
        $countryId = (int) ($this->request->getGet('country_id') ?? 0);
        if (!$countryId) {
            return $this->fail('country_id is required', 400);
        }

        return $this->respond([
            'success' => true,
            'data' => $this->locationService->getStates($countryId),
        ]);
    }

    public function cities()
    {
        $stateId = (int) ($this->request->getGet('state_id') ?? 0);
        if (!$stateId) {
            return $this->fail('state_id is required', 400);
        }

        $result = $this->locationService->searchCities(
            $stateId,
            $this->request->getGet('q'),
            (int) ($this->request->getGet('page') ?? 1),
            (int) ($this->request->getGet('per_page') ?? 30)
        );

        return $this->respond([
            'success' => true,
            'data' => $result['data'],
            'pagination' => $result['pagination'],
        ]);
    }

    public function timezones()
    {
        $result = $this->locationService->getTimezones();

        return $this->respond([
            'success' => true,
            'data' => $result['data'],
            'grouped' => $result['grouped'],
        ]);
    }
}
