require('dotenv').config(); // Load .env file

const axios = require('axios');
const { YoutubeTranscript } = require('youtube-transcript');
const fs = require('fs');
const path = require('path');
const { decode } = require('html-entities'); // Import HTML decoder


// Fetch the API key and channel ID from the environment variables
const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

// Function to sanitize the video title for filename
function sanitizeTitle(title) {
    return title
        .replace(/[^a-zA-Z0-9 ]/g, '') // Remove special characters
        .replace(/\s+/g, '')            // Remove spaces
        .replace(/39/g, "")           // Replace 39 with '
        .trim();                        // Trim leading/trailing spaces
}

// Function to get videos (with titles) from the YouTube channel
async function getVideos(pageToken = '') {
    const url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${CHANNEL_ID}&part=snippet,id&order=date&maxResults=50&pageToken=${pageToken}`;

    try {
        const response = await axios.get(url);
        const videos = response.data.items
            .filter(item => item.id.videoId) // Filter only videos (not playlists, etc.)
            .map(item => ({
                videoId: item.id.videoId,
                title: item.snippet.title
            }));

        // Check if there's a nextPageToken and make a recursive call to get more videos
        if (response.data.nextPageToken) {
            const nextPageVideos = await getVideos(response.data.nextPageToken);
            return videos.concat(nextPageVideos); // Concatenate current and next page videos
        } else {
            return videos; // Return the current page videos if no more pages
        }
    } catch (error) {
        console.error('Error fetching video data:', error);
    }
}

// Function to get transcript for a specific video and save it to a .txt file
async function downloadTranscript(video) {
    const sanitizedTitle = sanitizeTitle(video.title);
    const filePath = path.join(__dirname, `/transcripts/${sanitizedTitle}.txt`);

    try {
        const transcript = await YoutubeTranscript.fetchTranscript(video.videoId);

        // Create a string of the transcript, decoding HTML entities, removing leading hyphens, and handling undefined timestamps
        const transcriptText = transcript
            .map(entry => {
                let text = decode(entry.text);  // Decode HTML entities
                text = cleanEntities(text);     // Manually replace any remaining problematic entities
                text = text.replace(/^-\s*/, ''); // Remove leading hyphen if present
                const start = entry.start ? formatTimestamp(entry.start) : ''; // Handle undefined start time
                return `${start} ${text}`.trim(); // Combine timestamp and text
            })
            .join('\n');

        // Write the transcript to a .txt file
        fs.writeFileSync(filePath, transcriptText);
        console.log(`Transcript saved to ${filePath}`);
    } catch (error) {
        console.error(`Error getting or saving transcript for video ${video.videoId}: ${error.message}`);
    }
}

// Function to manually clean any problematic entities
function cleanEntities(text) {
    return text
        .replace(/&#39;/g, "'")     // Replace &#39; with '
        .replace(/&quot;/g, '"')    // Replace &quot; with "
        .replace(/&amp;/g, '&');    // Replace &amp; with &
}



// Main function to orchestrate the process
async function downloadAllTranscripts() {
    let videos = await getVideos(); // Get all video data (IDs and titles), handling pagination
    if (videos && videos.length > 0) {
        console.log(`Found ${videos.length} videos.`);
        for (const video of videos) {
            await downloadTranscript(video);
        }
    } else {
        console.log('No videos found.');
    }
}

downloadAllTranscripts();
