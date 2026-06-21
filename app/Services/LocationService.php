<?php

namespace App\Services;

use App\Models\CityModel;
use App\Models\CountryModel;
use App\Models\StateModel;
use App\Models\TimezoneModel;

class LocationService
{
    protected CountryModel $countryModel;
    protected StateModel $stateModel;
    protected CityModel $cityModel;
    protected TimezoneModel $timezoneModel;

    public function __construct()
    {
        $this->countryModel = new CountryModel();
        $this->stateModel = new StateModel();
        $this->cityModel = new CityModel();
        $this->timezoneModel = new TimezoneModel();
    }

    public function getCountries(): array
    {
        return $this->countryModel
            ->select('id, name, iso2, phonecode, emoji')
            ->where('flag', 1)
            ->orderBy('name', 'ASC')
            ->findAll();
    }

    public function getStates(int $countryId): array
    {
        return $this->stateModel
            ->select('id, name, country_id, country_code, iso2')
            ->where('country_id', $countryId)
            ->where('flag', 1)
            ->orderBy('name', 'ASC')
            ->findAll();
    }

    public function searchCities(int $stateId, ?string $query = null, int $page = 1, int $perPage = 30, ?int $includeId = null): array
    {
        $builder = $this->cityModel
            ->select('id, name, state_id, country_id, country_code')
            ->where('state_id', $stateId)
            ->where('flag', 1);

        if ($query) {
            $builder->like('name', $query);
        }

        $offset = ($page - 1) * $perPage;
        $total = $builder->countAllResults(false);
        $data = $builder->orderBy('name', 'ASC')->limit($perPage, $offset)->findAll();

        if ($includeId && !in_array($includeId, array_column($data, 'id'), true)) {
            $included = $this->cityModel
                ->select('id, name, state_id, country_id, country_code')
                ->where('id', $includeId)
                ->where('state_id', $stateId)
                ->first();
            if ($included) {
                array_unshift($data, $included);
            }
        }

        return [
            'data' => $data,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / max($perPage, 1)),
            ],
        ];
    }

    public function getTimezones(): array
    {
        $rows = $this->timezoneModel
            ->select('id, zone_group, timezone, php_timezone, sdt, dst')
            ->orderBy('zone_group', 'ASC')
            ->orderBy('timezone', 'ASC')
            ->findAll();

        $grouped = [];
        foreach ($rows as $row) {
            $group = $row['zone_group'];
            if (!isset($grouped[$group])) {
                $grouped[$group] = [];
            }
            $grouped[$group][] = $row;
        }

        return [
            'data' => $rows,
            'grouped' => $grouped,
        ];
    }

    public function getTimezoneById(int $id): ?array
    {
        return $this->timezoneModel->find($id);
    }
}
