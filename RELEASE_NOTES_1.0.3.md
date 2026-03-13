# Stream Sprites v1.0.3 Release Notes

## 🎉 Minor Update - Configuration Cleanup!

Version 1.0.3 improves the configuration file organization by keeping only non-default values in `.env`. This is a recommended update for all users.

**Release Date:** March 13, 2026

## ✨ Improvements

### Clean `.env` Files
The `.env` configuration file now only stores values that differ from defaults:
- Default values are automatically inferred by the server on startup
- Only your custom settings are written to disk
- Makes the configuration file cleaner and easier to read
- Reduces file size and removes clutter
- Easier to understand what you've actually changed

### How It Works
When you save settings from the dashboard:
- Values matching defaults are omitted from the saved file
- The server automatically fills in missing values from defaults on startup
- Configuration auto-recovery still works (missing values get defaults)
- All settings continue to work exactly the same

### Benefits
- **Cleaner config**: See only what you've customized
- **Easier editing**: Less noise in the file
- **Better version control**: Smaller diffs when tracking changes
- **Maintainable**: Defaults live in code, not duplicated in every `.env`

## 📊 Full Changelog

### Changed
- Configuration saving now filters out default values to keep `.env` minimal
- Server `defaultCfg` expanded to include all overlay defaults for proper filtering
- `filterDefaults()` function added to recursively remove default-valued properties
- Both `saveConfig` and `applySettings` endpoints now use filtered config writes

### Technical
- No functional changes to how configuration works
- Backward compatible: old `.env` files continue to work
- Auto-recovery ensures all required properties exist in memory

## 🙏 Credits
Thanks to the community for reporting issues and suggesting improvements!

## 📄 License
Apache License 2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE) files for details.

---

**Download this release**: https://github.com/SuperFurias/stream-sprites/releases/tag/v1.0.3

**Report issues**: https://github.com/SuperFurias/stream-sprites/issues

**Happy streaming!** 🎮✨
