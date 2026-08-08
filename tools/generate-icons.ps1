param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\icons'))

Add-Type -AssemblyName System.Drawing

function New-RoundedRectangle([single]$x, [single]$y, [single]$width, [single]$height, [single]$radius) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $radius * 2
    $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
    $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function Add-Cell($graphics, [single]$scale, [single]$x, [single]$y, [string]$fill, [bool]$outline, [bool]$blocked) {
    $path = New-RoundedRectangle ($x * $scale) ($y * $scale) (22 * $scale) (22 * $scale) (4 * $scale)
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($fill))
    $graphics.FillPath($brush, $path)
    $brush.Dispose()
    if ($outline) {
        $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#AAB8C2'), 3 * $scale)
        $graphics.DrawPath($pen, $path)
        $pen.Dispose()
    }
    if ($blocked) {
        $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#111820'), 4 * $scale)
        $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $graphics.DrawLine($pen, ($x + 5) * $scale, ($y + 17) * $scale, ($x + 17) * $scale, ($y + 5) * $scale)
        $pen.Dispose()
    }
    $path.Dispose()
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
foreach ($size in 16, 32, 48, 128, 256, 512) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $scale = [single]($size / 128.0)

    $base = New-RoundedRectangle (5 * $scale) (5 * $scale) (118 * $scale) (118 * $scale) (23 * $scale)
    $baseBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#111820'))
    $graphics.FillPath($baseBrush, $base)
    $baseBrush.Dispose()
    $base.Dispose()

    $gridColor = [System.Drawing.Color]::FromArgb(133, 170, 184, 194)
    $gridPen = [System.Drawing.Pen]::new($gridColor, [Math]::Max(0.7, 4 * $scale))
    $gridPen.StartCap = $gridPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    foreach ($coordinate in 35, 64, 93) {
        $graphics.DrawLine($gridPen, 35 * $scale, $coordinate * $scale, 93 * $scale, $coordinate * $scale)
        $graphics.DrawLine($gridPen, $coordinate * $scale, 35 * $scale, $coordinate * $scale, 93 * $scale)
    }
    $gridPen.Dispose()

    Add-Cell $graphics $scale 24 24 '#38D39F' $false $false
    Add-Cell $graphics $scale 53 24 '#283640' $true $false
    Add-Cell $graphics $scale 82 24 '#FF665E' $false $true
    Add-Cell $graphics $scale 24 53 '#283640' $true $false
    $center = New-RoundedRectangle (53 * $scale) (53 * $scale) (22 * $scale) (22 * $scale) (6 * $scale)
    $centerPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#AAB8C2'), 3 * $scale)
    $graphics.DrawPath($centerPen, $center)
    $centerPen.Dispose()
    $center.Dispose()
    $dotBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#AAB8C2'))
    $graphics.FillEllipse($dotBrush, 60.5 * $scale, 60.5 * $scale, 7 * $scale, 7 * $scale)
    $dotBrush.Dispose()
    Add-Cell $graphics $scale 82 53 '#38D39F' $false $false
    Add-Cell $graphics $scale 24 82 '#FF665E' $false $true
    Add-Cell $graphics $scale 53 82 '#38D39F' $false $false
    Add-Cell $graphics $scale 82 82 '#283640' $true $false

    $output = Join-Path $OutputDirectory "icon$size.png"
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
}
