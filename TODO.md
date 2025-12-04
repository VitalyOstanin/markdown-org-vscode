# TODO

## Configuration
- [ ] Remove hardcoded path from package.json default settings (`/home/vyt/devel/markdown-extract/target/release/markdown-extract`)
  - Change default to empty string
  - Show helpful error message on first run with configuration instructions
- [ ] Add validation for extractorPath configuration
  - Check if file exists using fs.existsSync()
  - Show clear error message if extractor not found
  - Suggest configuration steps

## Publishing
- [ ] Add publisher field to package.json before publishing to Marketplace
  - Register publisher at https://marketplace.visualstudio.com/manage
  - Add `"publisher": "YourPublisherName"` to package.json

## Documentation
- [ ] Improve README.md
  - Add screenshots/GIF demonstrations
  - Add usage examples with real markdown files
  - Document markdown-extract dependency and installation
  - Add troubleshooting section
- [ ] Create CHANGELOG.md
  - Document version 0.1.0 features
  - Set up format for future releases

## Testing
- [ ] Add unit tests for core functionality
  - Test timestamp parsing and manipulation
  - Test task status changes
  - Test priority toggling
- [ ] Add integration tests for commands
- [ ] Set up test framework (e.g., Mocha, Jest)
