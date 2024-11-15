const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const PORT = 3000;
const framesDir = path.join(__dirname, 'frames'); // Directory to store frames
const outputVideoPath = path.join(__dirname, 'output', 'video.mp4'); // Output video path

// Ensure the frames and output directories exist
if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);
if (!fs.existsSync(path.dirname(outputVideoPath))) fs.mkdirSync(path.dirname(outputVideoPath));

// Set up multer for handling frame uploads
const storage = multer.diskStorage({
    destination: framesDir,
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        cb(null, `frame_${timestamp}.png`); // Save each frame with a unique timestamp
    }
});
const upload = multer({ storage: storage });

// Function to compile frames into a 5-second video
function compileVideo(res) {
    const listFilePath = path.join(__dirname, 'frames.txt');
    const files = fs.readdirSync(framesDir)
        .filter(file => file.startsWith('frame_') && file.endsWith('.png'))
        .sort((a, b) => fs.statSync(path.join(framesDir, a)).mtime - fs.statSync(path.join(framesDir, b)).mtime);

    console.log(`Total frames found: ${files.length}`);

    // Define the target duration and frame rate
    const targetDuration = 5; // 5 seconds
    const fps = 30; // frames per second
    const requiredFrames = targetDuration * fps;
    const repeatCount = Math.max(1, Math.ceil(requiredFrames / files.length));

    console.log(`Each frame will repeat ${repeatCount} times to reach ${targetDuration} seconds duration.`);

    // Create frames.txt content
    const listContent = files.map(file => `file '${path.join(framesDir, file)}'\n`.repeat(repeatCount)).join('');
    fs.writeFileSync(listFilePath, listContent, 'utf8');

    // Log the frames.txt content
    const generatedListContent = fs.readFileSync(listFilePath, 'utf8');
    console.log('Generated frames.txt content:\n', generatedListContent);

    // FFmpeg command to compile frames into a 5-second video
    ffmpeg()
        .input(listFilePath)
        .inputOptions(['-f concat', '-safe 0', `-r ${fps}`]) // Ensure input frame rate is set
        .outputOptions([
            `-r ${fps}`, // Set output frame rate
            '-pix_fmt yuv420p',
            `-t ${targetDuration}`
        ])
        .on('start', (command) => {
            console.log('FFmpeg command:', command);
        })
        .on('progress', (progress) => {
            console.log(`Processing: ${progress.timemark} (${progress.frames} frames)`);
        })
        .on('end', () => {
            console.log('Video created successfully!');
            res.sendFile(outputVideoPath, err => {
                if (err) {
                    console.error('Error sending video file:', err);
                    res.status(500).send('Failed to send video');
                }
                // Clean up frames and list file after sending the video
                fs.unlinkSync(listFilePath);
                files.forEach(file => fs.unlinkSync(path.join(framesDir, file)));
            });
        })
        .on('error', (err) => {
            console.error('Error creating video:', err);
            res.status(500).send('Failed to create video');
        })
        .save(outputVideoPath);
}


// Route to receive frames and compile them into video
app.post('/uploadFrame', upload.single('frame'), (req, res) => {
    const { isLastFrame } = req.body;

    console.log(`Received frame: ${req.file.filename}`);

    // Check if this is the last frame
    if (isLastFrame === 'true') {
        compileVideo(res); // Compile video and send the response with video
    } else {
        res.status(200).send('Frame received'); // Acknowledge frame receipt
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
