# Rebuild the original pilcrow (paragraph) symbol, with no external font request.
Add-Type -AssemblyName System.Drawing
$iconDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/icons'))
[IO.Directory]::CreateDirectory($iconDirectory) | Out-Null
$glyph = New-Object Drawing.Drawing2D.GraphicsPath
$family = New-Object Drawing.FontFamily('Georgia')
$glyph.AddString([string][char]0x00B6, $family, [int][Drawing.FontStyle]::Regular, 330, [Drawing.PointF]::new(0,0), [Drawing.StringFormat]::GenericDefault)
$bounds = $glyph.GetBounds()
$transform = New-Object Drawing.Drawing2D.Matrix
$transform.Translate((256-$bounds.X-$bounds.Width/2),(256-$bounds.Y-$bounds.Height/2))
$glyph.Transform($transform)
# Export the same outlined glyph used for the PNGs, avoiding SVG font variation.
$points = $glyph.PathPoints
$types = $glyph.PathTypes
$segments = New-Object 'System.Collections.Generic.List[string]'
function Point-Text($point) { return $point.X.ToString('0.###',[Globalization.CultureInfo]::InvariantCulture) + ' ' + $point.Y.ToString('0.###',[Globalization.CultureInfo]::InvariantCulture) }
for ($i=0; $i -lt $points.Length; $i++) {
  $kind = $types[$i] -band 7
  if ($kind -eq 0) { $segments.Add('M'+(Point-Text $points[$i])) }
  elseif ($kind -eq 1) { $segments.Add('L'+(Point-Text $points[$i])) }
  elseif ($kind -eq 3) { $segments.Add('C'+(Point-Text $points[$i])+' '+(Point-Text $points[$i+1])+' '+(Point-Text $points[$i+2])); $i+=2 }
  if (($types[$i] -band 128) -ne 0) { $segments.Add('Z') }
}
$pathData = $segments -join ' '
"<svg xmlns=`"http://www.w3.org/2000/svg`" viewBox=`"0 0 512 512`"><rect width=`"512`" height=`"512`" fill=`"#FFFFFF`"/><path fill=`"#221D18`" d=`"$pathData`"/></svg>" | Set-Content -LiteralPath (Join-Path $iconDirectory 'pagestream-pilcrow.svg') -Encoding utf8
foreach ($size in @(32,180,192,512)) {
  $bitmap = New-Object Drawing.Bitmap($size,$size)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([Drawing.Color]::White)
  $graphics.ScaleTransform(($size/512.0),($size/512.0))
  $ink = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#221D18'))
  $graphics.FillPath($ink,$glyph)
  $bitmap.Save((Join-Path $iconDirectory "pagestream-pilcrow-$size.png"),[Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose(); $ink.Dispose()
}
$glyph.Dispose(); $family.Dispose(); $transform.Dispose()
