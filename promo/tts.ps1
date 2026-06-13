# Generates one voiceover WAV per scene from scenes.json using offline Windows SAPI.
# Output: promo/vo/<scene-id>.wav  (consumed by build.mjs and placed at each scene's start time)
#
# Swap-in for studio quality: replace this file's Speak loop with an ElevenLabs / OpenAI
# TTS call that writes the same promo/vo/<scene-id>.wav files — build.mjs is unchanged.

Add-Type -AssemblyName System.Speech

$root    = $PSScriptRoot
$scenes  = (Get-Content -Raw (Join-Path $root 'scenes.json') | ConvertFrom-Json).scenes
$outDir  = Join-Path $root 'vo'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

# Prefer a clearer installed voice if present (Zira > David > default).
$voices = $synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name }
foreach ($pref in @('Microsoft Zira Desktop', 'Microsoft Zira', 'Microsoft David Desktop', 'Microsoft David')) {
  if ($voices -contains $pref) { $synth.SelectVoice($pref); break }
}
Write-Host "Voice: $($synth.Voice.Name)"
$synth.Rate   = 2    # -10..10  (slightly brisk so each line fits its scene window)
$synth.Volume = 100

foreach ($s in $scenes) {
  $path = Join-Path $outDir ($s.id + '.wav')
  if (Test-Path $path) { Remove-Item $path -Force }
  $synth.SetOutputToWaveFile($path)
  $synth.Speak([string]$s.vo)
  $synth.SetOutputToNull()

  # report duration so you can confirm each line fits its scene window
  $reader = New-Object System.IO.BinaryReader([System.IO.File]::OpenRead($path))
  $bytes  = $reader.BaseStream.Length
  $reader.Close()
  $sceneMs = [int]($s.end - $s.start)
  Write-Host ("  {0,-12} scene {1,5}ms  vo~{2}KB  ->  {3}" -f $s.id, $sceneMs, [int]($bytes/1KB), ($s.vo))
}

$synth.Dispose()
Write-Host "`nDone. Voiceover WAVs written to promo/vo/"
