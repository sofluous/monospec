param(
    [string]$VaultPath = ".\obsidian",
    [string]$OutputPath = ".\monospec-data.generated.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Parse-JsonField {
    param(
        [string]$Value,
        [object]$Fallback
    )
    if ([string]::IsNullOrWhiteSpace($Value)) { return $Fallback }
    try {
        return ($Value | ConvertFrom-Json)
    } catch {
        return $Fallback
    }
}

function Parse-Tags {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return @() }
    return $Value.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
}

function Parse-Frontmatter {
    param([string]$Text)
    $m = [regex]::Match($Text, "(?s)^---\r?\n(.*?)\r?\n---")
    if (-not $m.Success) { return @{} }
    $body = $m.Groups[1].Value
    $map = @{}
    foreach ($line in ($body -split "`r?`n")) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line.TrimStart().StartsWith("#")) { continue }
        $idx = $line.IndexOf(":")
        if ($idx -lt 1) { continue }
        $k = $line.Substring(0, $idx).Trim()
        $v = $line.Substring($idx + 1).Trim()
        if ($v.StartsWith('"') -and $v.EndsWith('"') -and $v.Length -ge 2) {
            $v = $v.Substring(1, $v.Length - 2)
        }
        $map[$k] = $v
    }
    return $map
}

function Build-ItemFromMeta {
    param(
        [hashtable]$Meta,
        [string]$FileName
    )
    if (-not $Meta.ContainsKey("ms_id")) { return $null }
    if (-not $Meta.ContainsKey("ms_collection_id")) { return $null }

    $item = [ordered]@{
        id = $Meta["ms_id"]
        name = if ($Meta.ContainsKey("ms_name")) { $Meta["ms_name"] } else { $FileName }
        thumb = if ($Meta.ContainsKey("ms_thumb")) { $Meta["ms_thumb"] } else { "" }
        tags = Parse-Tags $Meta["ms_tags"]
        asset = [ordered]@{
            type = if ($Meta.ContainsKey("ms_asset_type")) { $Meta["ms_asset_type"] } else { "img" }
        }
        description = if ($Meta.ContainsKey("ms_description")) { $Meta["ms_description"] } else { "" }
        details = Parse-JsonField -Value $Meta["ms_details_json"] -Fallback @{}
        specs = Parse-JsonField -Value $Meta["ms_specs_json"] -Fallback @{}
    }

    if ($Meta.ContainsKey("ms_asset_src")) { $item.asset["src"] = $Meta["ms_asset_src"] }
    if ($Meta.ContainsKey("ms_asset_base")) { $item.asset["base"] = $Meta["ms_asset_base"] }
    if ($Meta.ContainsKey("ms_asset_count")) { $item.asset["count"] = [int]$Meta["ms_asset_count"] }
    if ($Meta.ContainsKey("ms_asset_fps")) { $item.asset["fps"] = [int]$Meta["ms_asset_fps"] }

    return [ordered]@{
        collectionId = $Meta["ms_collection_id"]
        collectionName = if ($Meta.ContainsKey("ms_collection_name")) { $Meta["ms_collection_name"] } else { $Meta["ms_collection_id"] }
        item = $item
    }
}

$vaultAbs = Resolve-Path -Path $VaultPath -ErrorAction Stop
$mdFiles = @(Get-ChildItem -Path $vaultAbs -Recurse -File -Filter "*.md")
$projectRoot = (Get-Location).Path

$collectionMap = @{}
$imported = 0

foreach ($file in $mdFiles) {
    $text = Get-Content -Raw $file.FullName
    $meta = Parse-Frontmatter $text
    if ($meta.Count -eq 0) { continue }

    $result = Build-ItemFromMeta -Meta $meta -FileName $file.BaseName
    if ($null -eq $result) { continue }

    $asset = $result.item.asset
    if ($asset -and $asset.Contains("src")) {
        $assetPath = Join-Path $projectRoot ([string]$asset["src"])
        if (-not (Test-Path $assetPath)) {
            Write-Warning ("Skipping {0}: asset file not found at {1}" -f $result.item.id, $asset["src"])
            continue
        }
    }

    $cid = $result.collectionId
    if (-not $collectionMap.ContainsKey($cid)) {
        $collectionMap[$cid] = [ordered]@{
            id = $cid
            name = $result.collectionName
            items = New-Object System.Collections.ArrayList
        }
    }
    [void]$collectionMap[$cid].items.Add($result.item)
    $imported++
}

$collections = @($collectionMap.Values | Sort-Object id | ForEach-Object {
    [ordered]@{
        id = $_.id
        name = $_.name
        items = @($_.items)
    }
})

$data = [ordered]@{ collections = $collections }
$json = $data | ConvertTo-Json -Depth 20

$outDir = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
$json | Set-Content -Encoding utf8 $OutputPath

Write-Host ("Generated {0} with {1} item(s) from {2} markdown file(s)." -f $OutputPath, $imported, $mdFiles.Count)
