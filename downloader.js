const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// Function to download an image
async function downloadImage(url, outputDir) {
  try {
    // Create a valid filename from the URL
    const filename = path.basename(url).split("?")[0]; // Remove query parameters
    const outputPath = path.join(outputDir, filename);

    // Download the image
    const response = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
    });

    // Save the image to disk
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        console.log(`Downloaded: ${filename}`);
        resolve();
      });
      writer.on("error", reject);
    });
  } catch (error) {
    console.error(`Error downloading ${url}: ${error.message}`);
  }
}

// Main function to scrape and download all images
async function downloadImagesFromUrl(targetUrl, customOutputDir = null) {
  try {
    // Create output directory
    const { hostname } = new URL(targetUrl);

    // Use custom output directory if provided, otherwise use "_downloads/hostname"
    const outputDir = customOutputDir
      ? path.resolve(customOutputDir)
      : path.join(__dirname, "_downloads", hostname);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Fetch the page
    console.log(`Fetching ${targetUrl}...`);
    const { data } = await axios.get(targetUrl);

    // Load the HTML into cheerio
    const $ = cheerio.load(data);

    // Find all img tags
    const imageUrls = [];
    $("img").each((i, element) => {
      let imageUrl = $(element).attr("src");

      if (imageUrl) {
        // Handle relative URLs
        if (imageUrl.startsWith("/")) {
          const baseUrl = new URL(targetUrl);
          imageUrl = `${baseUrl.protocol}//${baseUrl.host}${imageUrl}`;
        } else if (!imageUrl.startsWith("http")) {
          imageUrl = new URL(imageUrl, targetUrl).href;
        }

        imageUrls.push(imageUrl);
      }
    });

    console.log(`Found ${imageUrls.length} images.`);

    // Download all images
    const downloadPromises = imageUrls.map((url) =>
      downloadImage(url, outputDir)
    );
    await Promise.all(downloadPromises);

    console.log(`All images downloaded to ${outputDir}`);
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
    "Example: node downloader.js https://example.com --output ./my-images"
  );
  process.exit(1);
}

downloadImagesFromUrl(url, outputDir);
