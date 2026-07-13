# VB-CABLE (bundled for Windows installer)

Buddio ships [VB-CABLE](https://vb-audio.com/Cable/) so call routing works out of the box.

- **Vendor:** VB-Audio Software (donationware)
- **License / donate:** https://vb-audio.com/Services/licensing.htm
- **Do not commit** the extracted binaries — run `scripts/fetch-vbcable.ps1` (also invoked from `beforeBuildCommand` on Windows).

The NSIS installer:

1. Installs VB-CABLE during Buddio setup (if not already present)
2. Marks ownership only when Buddio performed the install
3. Uninstalls VB-CABLE when Buddio is uninstalled **only if** Buddio owned that install
