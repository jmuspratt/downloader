# Downloader

A lightweight Node.js utility for downloading images and HTML5 videos from web pages.

## Features

- Downloads all images from a specified URL
- Downloads HTML5 videos (mp4, ogv, webm, etc.)
- Creates unique directories based on the full URL to avoid conflicts
- Customizable output directory

## Installation

```bash
# Clone this repository
git clone https://github.com/yourusername/downloader.git
cd downloader

# Install dependencies
npm install
```

## Usage

### Basic Usage

```bash
npm start -- https://example.com
```

This will download all images and HTML5 videos from the specified URL to a directory in `_downloads/` named after the URL.

### Custom Output Directory

```bash
npm start -- https://example.com --output ./my-media
# or
npm start -- https://example.com -o ./my-media
```

## What Gets Downloaded

The downloader organizes files into separate directories by type:

### Images

- From `<img>` tags
- CSS background images (inline styles)
- Background images in stylesheets

### Videos

- `<video>` tags with `src` attributes
- `<source>` tags within `<video>` elements
- Video files in `<object>` and `<embed>` tags
- Links to video files in `<a>` tags

### Fonts

- Web fonts from stylesheets (woff, woff2, ttf, eot, otf)

### Other

- Any other media that doesn't fit the categories above

## Requirements

- Node.js 12.x or higher
- NPM or Yarn

## License

MIT
