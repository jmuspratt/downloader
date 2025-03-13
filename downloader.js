const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// Helper function to determine file type based on URL or content type
function getFileType(url, contentType = "") {
  const lowerUrl = url.toLowerCase();
  const ext = path.extname(lowerUrl.split("?")[0]).toLowerCase();

  // Image types
  const imageExts = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".svg",
    ".webp",
    ".bmp",
    ".ico",
    ".tiff",
  ];
  if (imageExts.includes(ext) || contentType.startsWith("image/")) {
    return "images";
  }

  // Video types
  const videoExts = [
    ".mp4",
    ".ogv",
    ".webm",
    ".mov",
    ".m4v",
    ".ogg",
    ".avi",
    ".wmv",
    ".flv",
  ];
  if (videoExts.includes(ext) || contentType.startsWith("video/")) {
    return "videos";
  }

  // Font types
  const fontExts = [".woff", ".woff2", ".eot", ".ttf", ".otf"];
  if (fontExts.includes(ext) || contentType.includes("font")) {
    return "fonts";
  }

  // Default to other for anything else
  return "other";
}

// Function to download a file
async function downloadFile(url, baseOutputDir) {
  try {
    // Get file info before downloading the full content
    const headResponse = await axios.head(url).catch(() => ({ headers: {} }));
    const contentType = headResponse.headers["content-type"] || "";

    // Determine file type category
    const fileType = getFileType(url, contentType);

    // Create subdirectory for the file type if it doesn't exist
    const outputDir = path.join(baseOutputDir, fileType);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create a valid filename from the URL
    const filename = path.basename(url.split("?")[0]); // Remove query parameters
    const outputPath = path.join(outputDir, filename);

    // Download the file
    const response = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
    });

    // Save the file to disk
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        console.log(`Downloaded ${fileType.slice(0, -1)}: ${filename}`);
        resolve();
      });
      writer.on("error", reject);
    });
  } catch (error) {
    console.error(`Error downloading ${url}: ${error.message}`);
  }
}

// Function to normalize URLs (handle relative URLs)
function normalizeUrl(url, baseUrl) {
  if (!url) return null;

  if (url.startsWith("/")) {
    const base = new URL(baseUrl);
    return `${base.protocol}//${base.host}${url}`;
  } else if (!url.startsWith("http")) {
    return new URL(url, baseUrl).href;
  }

  return url;
}

// Main function to scrape and download all media
async function downloadMediaFromUrl(targetUrl, customOutputDir = null) {
  try {
    // Create output directory using full URL
    const urlObj = new URL(targetUrl);

    // Create a directory name from the full URL
    // Replace protocol and special characters, use both hostname and pathname
    let urlDirName = urlObj.hostname + urlObj.pathname;

    // Clean the URL to make it suitable for a directory name
    // Replace slashes, question marks, and other problematic characters
    urlDirName = urlDirName
      .replace(/^https?:\/\//, "") // Remove protocol
      .replace(/\//g, "-") // Replace slashes with hyphens
      .replace(/\?/g, "_") // Replace question marks with underscores
      .replace(/:/g, "_") // Replace colons with underscores
      .replace(/[\\*<>|"]/g, "") // Remove other invalid filename chars
      .replace(/\.+$/, "") // Remove trailing dots
      .replace(/--+/g, "-") // Replace multiple hyphens with a single one
      .replace(/-$/, ""); // Remove trailing hyphen

    // If the directory name is too long, truncate it
    if (urlDirName.length > 80) {
      urlDirName = urlDirName.substring(0, 80);
    }

    // Use custom output directory if provided, otherwise use "_downloads/url-based-dirname"
    const baseOutputDir = customOutputDir
      ? path.resolve(customOutputDir)
      : path.join(__dirname, "_downloads", urlDirName);

    if (!fs.existsSync(baseOutputDir)) {
      fs.mkdirSync(baseOutputDir, { recursive: true });
    }

    // Fetch the page
    console.log(`Fetching ${targetUrl}...`);
    const { data } = await axios.get(targetUrl);

    // Load the HTML into cheerio
    const $ = cheerio.load(data);

    // Arrays to store all media URLs
    const mediaUrls = new Set();

    // 1. Find all img tags
    $("img").each((i, element) => {
      let url = $(element).attr("src");
      if (url) {
        mediaUrls.add(normalizeUrl(url, targetUrl));
      }
    });

    // 2. Extract background images from inline styles
    $("*").each((i, element) => {
      const style = $(element).attr("style");
      if (style) {
        // Match url() patterns in style attributes
        const matches = style.match(/url\(['"]?([^'")]+)['"]?\)/g) || [];

        for (const match of matches) {
          // Extract the URL from the url() pattern
          const urlMatch = match.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (urlMatch && urlMatch[1] && !urlMatch[1].startsWith("data:")) {
            mediaUrls.add(normalizeUrl(urlMatch[1], targetUrl));
          }
        }
      }
    });

    // 3. Find video sources (both video tags and source tags within video)
    // Direct video src attributes
    $("video").each((i, element) => {
      let url = $(element).attr("src");
      if (url) {
        mediaUrls.add(normalizeUrl(url, targetUrl));
      }
    });

    // Source tags within video elements
    $("video source").each((i, element) => {
      let url = $(element).attr("src");
      if (url) {
        mediaUrls.add(normalizeUrl(url, targetUrl));
      }
    });

    // 4. Check for HTML5 video in object and embed tags
    $("object, embed").each((i, element) => {
      let url = $(element).attr("src") || $(element).attr("data");
      if (url) {
        mediaUrls.add(normalizeUrl(url, targetUrl));
      }
    });

    // 5. Extract media from CSS stylesheets
    const stylesheetUrls = [];
    $('link[rel="stylesheet"]').each((i, element) => {
      const href = $(element).attr("href");
      if (href) {
        stylesheetUrls.push(normalizeUrl(href, targetUrl));
      }
    });

    // 6. Check style tags
    $("style").each((i, element) => {
      const cssText = $(element).html();
      if (cssText) {
        // Find all url() patterns in the CSS
        const matches = cssText.match(/url\(['"]?([^'")]+)['"]?\)/g) || [];

        for (const match of matches) {
          const urlMatch = match.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (urlMatch && urlMatch[1] && !urlMatch[1].startsWith("data:")) {
            mediaUrls.add(normalizeUrl(urlMatch[1], targetUrl));
          }
        }
      }
    });

    // 7. Download CSS files to extract media
    for (const stylesheetUrl of stylesheetUrls) {
      try {
        console.log(`Fetching CSS: ${stylesheetUrl}`);
        const { data: cssText } = await axios.get(stylesheetUrl);

        // Find all url() patterns in the CSS
        const matches = cssText.match(/url\(['"]?([^'")]+)['"]?\)/g) || [];

        for (const match of matches) {
          const urlMatch = match.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (urlMatch && urlMatch[1] && !urlMatch[1].startsWith("data:")) {
            mediaUrls.add(normalizeUrl(urlMatch[1], stylesheetUrl));
          }
        }
      } catch (error) {
        console.error(`Error fetching CSS ${stylesheetUrl}: ${error.message}`);
      }
    }

    // 8. Look for media URLs in anchor tags
    $("a").each((i, element) => {
      let url = $(element).attr("href");
      if (url) {
        url = normalizeUrl(url, targetUrl);

        // Check if it's a direct link to a media file
        const mediaExts = [
          ".jpg",
          ".jpeg",
          ".png",
          ".gif",
          ".mp4",
          ".ogv",
          ".webm",
          ".mov",
          ".m4v",
          ".ogg",
          ".svg",
          ".woff",
          ".woff2",
          ".eot",
          ".ttf",
          ".otf",
        ];
        if (mediaExts.some((ext) => url.toLowerCase().endsWith(ext))) {
          mediaUrls.add(url);
        }
      }
    });

    // Filter out nulls and convert to array
    const mediaUrlsArray = [...mediaUrls].filter(Boolean);

    console.log(`Found ${mediaUrlsArray.length} media files to download.`);

    // Download all media
    const downloadPromises = mediaUrlsArray.map((url) =>
      downloadFile(url, baseOutputDir)
    );
    await Promise.all(downloadPromises);

    // Count files in each directory
    const stats = {};
    const types = ["images", "videos", "fonts", "other"];

    for (const type of types) {
      const typeDir = path.join(baseOutputDir, type);
      if (fs.existsSync(typeDir)) {
        const files = fs.readdirSync(typeDir);
        stats[type] = files.length;
      } else {
        stats[type] = 0;
      }
    }

    console.log(`\nDownload Summary:`);
    console.log(`- Images: ${stats.images}`);
    console.log(`- Videos: ${stats.videos}`);
    console.log(`- Fonts: ${stats.fonts}`);
    console.log(`- Other: ${stats.other}`);
    console.log(`\nAll media downloaded to ${baseOutputDir}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let url = null;
  let outputDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" || args[i] === "-o") {
      if (i + 1 < args.length) {
        outputDir = args[i + 1];
        i++; // Skip the next argument as it's the output directory
      }
    } else if (!url) {
      // The first non-flag argument is assumed to be the URL
      url = args[i];
    }
  }

  return { url, outputDir };
}

// Main execution
const { url, outputDir } = parseArgs();

if (!url) {
  console.log("Usage: node downloader.js <url> [--output|-o <directory>]");
  console.log(
    "Example: node downloader.js https://example.com --output ./my-media"
  );
  process.exit(1);
}

downloadMediaFromUrl(url, outputDir);
