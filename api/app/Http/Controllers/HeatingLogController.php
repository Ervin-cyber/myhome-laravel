<?php

namespace App\Http\Controllers;

use App\Models\HeatingLog;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class HeatingLogController extends Controller
{
    public function index()
    {
        return HeatingLog::orderBy('timestamp', 'desc')->limit(100)->get();
    }

    public function store(Request $request)
    {
        HeatingLog::create($request->all());

        return response()->json(['message' => "Success"], 200);
    }
}
