# Original SF vector mark, matching public/solidflow.svg. Windows GDI+ rasterizes
# the paths; the ICO embeds four independent PNG images with transparency.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'build'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$canvas = [System.Drawing.Bitmap]::new(1024, 1024)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$matrix = [System.Drawing.Drawing2D.Matrix]::new(4, -0.56, 0, 4, 0, 72)
$graphics.Transform = $matrix
$background = [System.Drawing.Drawing2D.GraphicsPath]::new()
$background.AddArc(24, 42, 36, 36, 180, 90)
$background.AddArc(196, 42, 36, 36, 270, 90)
$background.AddArc(196, 188, 36, 36, 0, 90)
$background.AddArc(24, 188, 36, 36, 90, 90)
$background.CloseFigure()
$gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Rectangle]::new(24, 42, 208, 182),
    [System.Drawing.ColorTranslator]::FromHtml('#258fd0'),
    [System.Drawing.ColorTranslator]::FromHtml('#07558f'),
    [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
)
$graphics.FillPath($gradient, $background)
$s = [System.Drawing.Drawing2D.GraphicsPath]::new()
$s.AddBezier(119,85,104,73,80,74,65,86)
$s.AddBezier(65,86,45,103,57,124,79,131)
$s.AddLine(79,131,94,136)
$s.AddBezier(94,136,111,142,104,162,88,162)
$s.AddBezier(88,162,77,162,67,156,59,149)
$s.AddLine(59,149,47,167)
$s.AddBezier(47,167,58,178,74,183,91,182)
$s.AddBezier(91,182,117,181,132,165,130,145)
$s.AddBezier(130,145,128,125,113,120,94,114)
$s.AddLine(94,114,82,110)
$s.AddBezier(82,110,71,106,73,98,81,96)
$s.AddBezier(81,96,91,92,101,96,108,103)
$s.CloseFigure()
$graphics.FillPath([System.Drawing.Brushes]::White, $s)
$f = [System.Drawing.Drawing2D.GraphicsPath]::new()
$points = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(145,80), [System.Drawing.PointF]::new(209,80),
    [System.Drawing.PointF]::new(209,101), [System.Drawing.PointF]::new(168,101),
    [System.Drawing.PointF]::new(168,121), [System.Drawing.PointF]::new(202,121),
    [System.Drawing.PointF]::new(202,142), [System.Drawing.PointF]::new(168,142),
    [System.Drawing.PointF]::new(168,181), [System.Drawing.PointF]::new(145,181)
)
$f.AddPolygon($points)
$graphics.FillPath([System.Drawing.Brushes]::White, $f)
$graphics.Dispose(); $matrix.Dispose(); $background.Dispose(); $gradient.Dispose(); $s.Dispose(); $f.Dispose()
$sizes = @(16, 32, 48, 256)
$images = [System.Collections.Generic.List[byte[]]]::new()
foreach ($size in $sizes) {
    $image = [System.Drawing.Bitmap]::new($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($image)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($canvas, [System.Drawing.Rectangle]::new(0, 0, $size, $size))
    $stream = [System.IO.MemoryStream]::new()
    $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $images.Add($stream.ToArray())
    $stream.Dispose(); $g.Dispose(); $image.Dispose()
}
$canvas.Dispose()
$iconPath = Join-Path $outputDirectory 'icon.ico'
$iconStream = [System.IO.File]::Create($iconPath)
$writer = [System.IO.BinaryWriter]::new($iconStream)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($index = 0; $index -lt $sizes.Count; $index++) {
        $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$images[$index].Length); $writer.Write([uint32]$offset)
        $offset += $images[$index].Length
    }
    foreach ($bytes in $images) { $writer.Write($bytes) }
} finally { $writer.Dispose(); $iconStream.Dispose() }
[pscustomobject]@{ path = $iconPath; sizes = $sizes; bytes = (Get-Item -LiteralPath $iconPath).Length } | ConvertTo-Json
