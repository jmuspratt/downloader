const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// Function to download a file (image or video)
async function downloadFile(url, outputDir, fileType) {
  try {
    // Create a valid filename from the URL
    const filename = path.basename(url).split("?")[0]; // Remove query parameters
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
        console.log(`Downloaded ${fileType}: ${filename}`);
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
    const outputDir = customOutputDir
      ? path.resolve(customOutputDir)
      : path.join(__dirname, "_downloads", urlDirName);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Fetch the page
    console.log(`Fetching ${targetUrl}...`);
    const { data } = await axios.get(targetUrl);

    // Load the HTML into cheerio
    const $ = cheerio.load(data);

    // Find all img tags for images
    const imageUrls = [];
    $("img").each((i, element) => {
      let imageUrl = $(element).attr("src");
      if (imageUrl) {
        imageUrl = normalizeUrl(imageUrl, targetUrl);
        imageUrls.push(imageUrl);
      }
    });

    // Find all video sources (both video tags and source tags within video)
    const videoUrls = [];

    // Direct video src attributes
    $("video").each((i, element) => {
      let videoUrl = $(element).attr("src");
      if (videoUrl) {
        videoUrl = normalizeUrl(videoUrl, targetUrl);
        videoUrls.push(videoUrl);
      }
    });

    // Source tags within video elements
    $("video source").each((i, element) => {
      let videoUrl = $(element).attr("src");
      if (videoUrl) {
        videoUrl = normalizeUrl(videoUrl, targetUrl);
        videoUrls.push(videoUrl);
      }
    });

    // Check for HTML5 video in object and embed tags
    $("object, embed").each((i, element) => {
      let mediaUrl = $(element).attr("src") || $(element).attr("data");
      if (mediaUrl) {
        mediaUrl = normalizeUrl(mediaUrl, targetUrl);

        // Check if it's a video file by extension
        const videoExtensions = [
          ".mp4",
          ".ogv",
          ".webm",
          ".mov",
          ".m4v",
          ".ogg",
        ];
        if (
          videoExtensions.some((ext) => mediaUrl.toLowerCase().endsWith(ext))
        ) {
          videoUrls.push(mediaUrl);
        }
      }
    });

    // Look for video URLs in anchor tags
    $("a").each((i, element) => {
      let linkUrl = $(element).attr("href");
      if (linkUrl) {
        linkUrl = normalizeUrl(linkUrl, targetUrl);

        // Check if it's a direct link to a video file
        const videoExtensions = [
          ".mp4",
          ".ogv",
          ".webm",
          ".mov",
          ".m4v",
          ".ogg",
        ];
        if (
          videoExtensions.some((ext) => linkUrl.toLowerCase().endsWith(ext))
        ) {
          videoUrls.push(linkUrl);
        }
      }
    });

    // Remove duplicates from video URLs
    const uniqueVideoUrls = [...new Set(videoUrls)];

    console.log(
      `Found ${imageUrls.length} images and ${uniqueVideoUrls.length} videos.`
    );

    // Download all media
    const downloadPromises = [
      ...imageUrls.map((url) => downloadFile(url, outputDir, "image")),
      ...uniqueVideoUrls.map((url) => downloadFile(url, outputDir, "video")),
    ];

    await Promise.all(downloadPromises);

    console.log(`All media downloaded to ${outputDir}`);
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
