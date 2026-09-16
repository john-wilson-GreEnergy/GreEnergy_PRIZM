# Installer source

WiX Toolset v5 authoring for the machine-wide PRIZM package. `Product.wxs` consumes the prepared `artifacts\payload` directory created by `package-windows.ps1`.

Third-party binaries are never checked into source control. The packaging script downloads pinned Node.js and WinSW releases, verifies their SHA-256 hashes from `versions.json`, and stages them for WiX.
