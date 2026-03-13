# Stream Sprites v1.0.2 Release Notes

## 🎉 Minor Update - Bug Fixes!

Version 1.0.2 addresses an important issue with GIF skin switching. This is a recommended update for all users.

**Release Date:** March 13, 2026

## 🐛 Bug Fixes

### GIF Skin Switching Fix
Fixed `!skin` command when switching between GIF skins:
- Previously, switching from one GIF skin to another (e.g., `cat` → `bunbun`) would not update the displayed GIF
- The avatar would continue showing the old GIF instead of the newly assigned one
- Required switching to default skin first before applying another GIF skin
- Now GIF skins switch correctly in a single command

### GIF Animation Restart
Fixed GIF animation restart when changing skins:
- When switching to a different GIF skin, the animation now properly restarts from the beginning
- Ensures smooth visual transitions between different animated skins

## 📊 Full Changelog

### Fixed
- `!skin` command now correctly switches between GIF skins without requiring intermediate default skin
- GIF animations restart properly when changing to a different GIF skin
- GIF element `src` is now updated when skin changes to a different GIF file

## 🙏 Credits
Thanks to the community for reporting issues and suggesting improvements!

## 📄 License
Apache License 2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE) files for details.

---

**Download this release**: https://github.com/SuperFurias/stream-sprites/releases/tag/v1.0.2

**Report issues**: https://github.com/SuperFurias/stream-sprites/issues

**Happy streaming!** 🎮✨
