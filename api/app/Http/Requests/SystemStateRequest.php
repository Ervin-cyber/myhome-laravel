<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SystemStateRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'target_temp' => 'nullable|numeric',
            'hvac_until' => 'nullable|integer',
            'heating_until' => 'nullable|integer',
            'heating_on' => 'nullable|integer',
            'mode' => 'nullable|in:heating,cooling',
            'cooling_on' => 'nullable|integer'
        ];
    }
}
