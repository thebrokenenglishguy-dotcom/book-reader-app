(function () {
    'use strict';

    const elements = {
        text: document.getElementById('text-input'),
        wordCount: document.getElementById('word-count'),
        readingTime: document.getElementById('reading-time'),
        characterCount: document.getElementById('character-count'),
        progressLabel: document.getElementById('progress-label'),
        progressPercent: document.getElementById('progress-percent'),
        progressTrack: document.getElementById('progress-track'),
        progressFill: document.getElementById('progress-fill'),
        status: document.getElementById('reading-status'),
        uploadStatus: document.getElementById('upload-status'),
        fileInput: document.getElementById('file-input'),
        dropZone: document.getElementById('drop-zone'),
        start: document.getElementById('start-reading'),
        clear: document.getElementById('clear-text'),
        voice: document.getElementById('voice-select'),
        speed: document.getElementById('speed-select'),
        speedValue: document.getElementById('speed-value'),
        previous: document.getElementById('previous-paragraph'),
        next: document.getElementById('next-paragraph'),
        restart: document.getElementById('restart-reading'),
        play: document.getElementById('play-reading'),
        playIcon: document.getElementById('play-icon'),
        pause: document.getElementById('pause-reading'),
        stop: document.getElementById('stop-reading'),
        paragraphCount: document.getElementById('paragraph-count'),
        currentSentence: document.getElementById('current-sentence'),
        contextBefore: document.getElementById('context-before'),
        contextAfter: document.getElementById('context-after'),
        currentPosition: document.getElementById('current-position'),
        message: document.getElementById('playback-message'),
        speechNote: document.getElementById('speech-support-note'),
        themeToggle: document.getElementById('theme-toggle'),
        themeIcon: document.getElementById('theme-icon'),
        themeLabel: document.getElementById('theme-label'),
        shareButton: document.getElementById('open-share'),
        shareDialog: document.getElementById('share-dialog'),
        shareClose: document.getElementById('close-share'),
        shareQr: document.getElementById('share-qr'),
        shareLink: document.getElementById('share-link'),
        copyShareLink: document.getElementById('copy-share-link'),
        shareStatus: document.getElementById('share-status'),
        musicUrl: document.getElementById('music-url'),
        loadMusic: document.getElementById('load-music'),
        musicPlay: document.getElementById('music-play'),
        musicPause: document.getElementById('music-pause'),
        musicStop: document.getElementById('music-stop'),
        musicVolume: document.getElementById('music-volume'),
        musicVolumeValue: document.getElementById('music-volume-value'),
        musicStatus: document.getElementById('music-status'),
    };

    const supportedRates = new Set(['0.5', '0.75', '1', '1.25', '1.5', '1.75', '2', '2.5', '3']);
    const maxFileSize = 50 * 1024 * 1024;
    const maxChunkLength = 220;
    const publicAppUrl = 'https://thebrokenenglishguy-dotcom.github.io/book-reader-app/';
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    let voices = [];
    let paragraphs = [];
    let paragraphWordCounts = [];
    let wordPrefixes = [];
    let chunks = [];
    let paragraphIndex = 0;
    let chunkIndex = 0;
    let currentUtterance = null;
    let resumeCharIndex = 0;
    let isReading = false;
    let isPaused = false;
    let sessionVersion = 0;
    let wordCountTimer = 0;
    let lastBoundaryWordCount = 0;

    let youtubePlayer = null;
    let youtubePlayerReady = false;
    let youtubeApiReady = false;
    let youtubeApiLoading = false;
    let pendingVideoId = null;

    function setMusicStatus(message, isError) {
        elements.musicStatus.textContent = message;
        elements.musicStatus.classList.toggle('error', Boolean(isError));
    }

    function getYouTubeVideoId(input) {
        try {
            const url = new URL(input.trim());
            const hostname = url.hostname.toLowerCase();
            const host = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
            if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
            if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
                if (url.searchParams.get('v')) return url.searchParams.get('v');
                const parts = url.pathname.split('/').filter(Boolean);
                if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] || null;
            }
        } catch (_error) { return null; }
        return null;
    }

    function setMusicControlsEnabled(enabled) {
        elements.musicPlay.disabled = !enabled;
        elements.musicPause.disabled = !enabled;
        elements.musicStop.disabled = !enabled;
    }

    function loadYouTubeApi() {
        if (window.YT && window.YT.Player) {
            youtubeApiReady = true;
            createYouTubePlayer();
            return;
        }
        if (youtubeApiLoading) return;
        youtubeApiLoading = true;
        const previousCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof previousCallback === 'function') previousCallback();
            youtubeApiReady = true;
            createYouTubePlayer();
        };
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.onerror = () => {
            youtubeApiLoading = false;
            setMusicStatus('The YouTube player could not load. Check your internet connection and try again.', true);
        };
        document.head.append(script);
    }

    function createYouTubePlayer() {
        if (!youtubeApiReady || !pendingVideoId || youtubePlayer) return;
        const videoId = pendingVideoId;
        pendingVideoId = null;
        youtubePlayer = new window.YT.Player('youtube-player', {
            videoId,
            playerVars: { controls: 1, playsinline: 1, rel: 0, origin: window.location.origin },
            events: {
                onReady: (event) => {
                    youtubePlayerReady = true;
                    event.target.setVolume(Number(elements.musicVolume.value));
                    if (pendingVideoId) {
                        event.target.cueVideoById(pendingVideoId);
                        pendingVideoId = null;
                    }
                    setMusicControlsEnabled(true);
                    setMusicStatus('Music is ready. Press Play music when you want to listen.', false);
                },
                onError: (event) => {
                    const messages = {
                        2: 'That YouTube link is not valid. Check the URL and try again.',
                        5: 'This video cannot be played in the HTML5 player.',
                        100: 'This video was not found or is private.',
                        101: 'The owner does not allow this video to play on other websites.',
                        150: 'The owner does not allow this video to play on other websites.'
                    };
                    setMusicStatus(messages[event.data] || 'YouTube could not play this video. Try another link.', true);
                    setMusicControlsEnabled(false);
                },
                onStateChange: (event) => {
                    if (event.data === window.YT.PlayerState.PLAYING) setMusicStatus('Background music is playing.', false);
                    else if (event.data === window.YT.PlayerState.PAUSED) setMusicStatus('Background music is paused.', false);
                    else if (event.data === window.YT.PlayerState.ENDED) setMusicStatus('The music has ended.', false);
                }
            }
        });
    }

    function loadBackgroundMusic() {
        const videoId = getYouTubeVideoId(elements.musicUrl.value);
        if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            setMusicStatus('Please paste a valid YouTube video link.', true);
            return;
        }
        remember('readwell-music-url', elements.musicUrl.value.trim());
        setMusicControlsEnabled(false);
        if (youtubePlayer && youtubePlayerReady) {
            youtubePlayer.cueVideoById(videoId);
            youtubePlayer.setVolume(Number(elements.musicVolume.value));
            setMusicControlsEnabled(true);
            setMusicStatus('Music loaded. Press Play music to start.', false);
            return;
        }
        pendingVideoId = videoId;
        setMusicStatus('Loading the YouTube player…', false);
        loadYouTubeApi();
    }

    function countWords(text) {
        let count = 0;
        for (const _match of text.matchAll(/\S+/g)) count += 1;
        return count;
    }

    function showMessage(message, isError) {
        elements.message.textContent = message;
        elements.message.classList.toggle('error', Boolean(isError));
    }

    function showUploadMessage(message, isError) {
        elements.uploadStatus.textContent = message;
        elements.uploadStatus.classList.toggle('error', Boolean(isError));
    }

    function remember(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (_error) {
            showMessage('Your browser blocked saving preferences. They will still work for this visit.', true);
        }
    }

    function readPreference(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (_error) {
            return null;
        }
    }

    function updateTextStats() {
        const text = elements.text.value;
        const totalWords = countWords(text);
        elements.wordCount.textContent = totalWords.toLocaleString();
        elements.readingTime.textContent = totalWords === 0 ? '0 min' : `${Math.max(1, Math.ceil(totalWords / 220))} min`;
        elements.characterCount.textContent = `${text.length.toLocaleString()} ${text.length === 1 ? 'character' : 'characters'}`;
        elements.start.disabled = !text.trim() || !synth;
        elements.clear.disabled = !text;
        elements.play.disabled = !text.trim() || !synth;
        elements.restart.disabled = !text.trim() || !synth;
        elements.stop.disabled = !isReading && !isPaused;
        elements.pause.disabled = !isReading || isPaused;
        elements.previous.disabled = !text.trim();
        elements.next.disabled = !text.trim();
        elements.progressLabel.textContent = totalWords ? 'Ready when you are' : 'Ready when you are';
        if (!text.trim()) resetReaderCard();
        updateNavigationButtons();
    }

    function updateNavigationButtons() {
        const hasText = Boolean(elements.text.value.trim());
        elements.previous.disabled = !hasText || (paragraphs.length > 0 && paragraphIndex <= 0);
        elements.next.disabled = !hasText || (paragraphs.length > 0 && paragraphIndex >= paragraphs.length - 1);
    }

    function resetReaderCard() {
        elements.paragraphCount.textContent = 'YOUR TEXT WILL APPEAR HERE';
        elements.currentSentence.textContent = 'Every good story begins with a first word. Paste your text or upload a book, and we’ll read it together.';
        elements.contextBefore.textContent = '';
        elements.contextAfter.textContent = '';
        elements.currentPosition.textContent = 'A QUIET MOMENT, JUST FOR YOU';
        setProgress(0, 0);
    }

    function setProgress(wordsRead, totalWords) {
        const percent = totalWords ? Math.max(0, Math.min(100, Math.round(wordsRead / totalWords * 100))) : 0;
        elements.progressFill.style.width = `${percent}%`;
        elements.progressPercent.textContent = `${percent}%`;
        elements.progressTrack.setAttribute('aria-valuenow', String(percent));
        elements.progressLabel.textContent = totalWords ? `${wordsRead.toLocaleString()} / ${totalWords.toLocaleString()} words` : 'Ready when you are';
    }

    function splitLongSentence(sentence) {
        const result = [];
        let remaining = sentence.trim();
        while (remaining.length > maxChunkLength) {
            let splitAt = remaining.lastIndexOf(' ', maxChunkLength);
            if (splitAt < 1) splitAt = maxChunkLength;
            result.push(remaining.slice(0, splitAt).trim());
            remaining = remaining.slice(splitAt).trim();
        }
        if (remaining) result.push(remaining);
        return result;
    }

    function makeChunks(paragraph) {
        const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [paragraph];
        const chunksForParagraph = [];
        let current = '';
        for (const sentence of sentences) {
            const parts = sentence.trim().length > maxChunkLength ? splitLongSentence(sentence) : [sentence.trim()];
            for (const part of parts) {
                if (!part) continue;
                const combined = current ? `${current} ${part}` : part;
                if (combined.length > maxChunkLength && current) {
                    chunksForParagraph.push(current);
                    current = part;
                } else {
                    current = combined;
                }
            }
        }
        if (current) chunksForParagraph.push(current);
        return chunksForParagraph.length ? chunksForParagraph : [paragraph];
    }

    function prepareParagraphs() {
        paragraphs = elements.text.value
            .replace(/\r\n?/g, '\n')
            .split(/\n\s*\n+/)
            .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
            .filter(Boolean);

        if (paragraphs.length === 0 && elements.text.value.trim()) {
            paragraphs = [elements.text.value.replace(/\s+/g, ' ').trim()];
        }

        paragraphWordCounts = paragraphs.map(countWords);
        wordPrefixes = [0];
        for (const count of paragraphWordCounts) {
            wordPrefixes.push(wordPrefixes[wordPrefixes.length - 1] + count);
        }
    }

    function renderCurrentChunk() {
        if (!paragraphs.length || paragraphIndex >= paragraphs.length) return;
        if (!chunks.length) chunks = makeChunks(paragraphs[paragraphIndex]);
        const currentChunk = chunks[chunkIndex] || chunks[0];
        elements.paragraphCount.textContent = `PARAGRAPH ${paragraphIndex + 1} OF ${paragraphs.length}`;
        elements.currentSentence.textContent = currentChunk;
        elements.contextBefore.textContent = chunkIndex > 0 ? chunks[chunkIndex - 1] : '';
        elements.contextAfter.textContent = chunkIndex + 1 < chunks.length ? chunks[chunkIndex + 1] : '';
        elements.currentPosition.textContent = `PASSAGE ${chunkIndex + 1} OF ${chunks.length}`;
        updateNavigationButtons();
    }

    function updateProgress(readWords) {
        const totalWords = wordPrefixes.length ? wordPrefixes[wordPrefixes.length - 1] : 0;
        setProgress(Math.min(totalWords, Math.max(0, readWords)), totalWords);
    }

    function selectedVoice() {
        const name = elements.voice.value;
        return voices.find((voice) => voice.name === name && voice.lang.toLowerCase().startsWith('en')) || null;
    }

    function updateControls() {
        elements.start.disabled = !elements.text.value.trim() || !synth || isReading;
        elements.play.disabled = !elements.text.value.trim() || !synth || isReading;
        elements.playIcon.textContent = isPaused ? '▶' : '▶';
        elements.pause.disabled = !isReading || isPaused;
        elements.stop.disabled = !isReading && !isPaused;
        elements.restart.disabled = !elements.text.value.trim() || !synth;
        elements.clear.disabled = !elements.text.value;
        elements.status.classList.toggle('speaking', isReading && !isPaused);
        elements.status.classList.toggle('paused', isPaused);
        elements.status.innerHTML = isReading && !isPaused
            ? '<span></span> READING'
            : isPaused ? '<span></span> PAUSED' : '<span></span> READY';
    }

    function speakCurrentChunk() {
        if (!synth || !isReading || isPaused) return;
        if (!paragraphs.length) return;

        if (!chunks.length) chunks = makeChunks(paragraphs[paragraphIndex]);
        if (chunkIndex >= chunks.length) {
            paragraphIndex += 1;
            chunkIndex = 0;
            chunks = [];
            if (paragraphIndex >= paragraphs.length) {
                isReading = false;
                isPaused = false;
                currentUtterance = null;
                updateProgress(wordPrefixes[wordPrefixes.length - 1] || 0);
                updateControls();
                showMessage('You’ve reached the end. What a lovely read.', false);
                return;
            }
            renderCurrentChunk();
            speakCurrentChunk();
            return;
        }

        const version = sessionVersion;
        const chunk = chunks[chunkIndex];
        const utteranceStart = resumeCharIndex;
        const utterance = new SpeechSynthesisUtterance(chunk.slice(utteranceStart));
        utterance.lang = 'en-US';
        utterance.rate = Number(elements.speed.value);
        const voice = selectedVoice();
        if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang;
        }
        currentUtterance = utterance;
        lastBoundaryWordCount = 0;
        utterance.onboundary = (event) => {
            if (version !== sessionVersion || event.name !== 'word') return;
            const boundary = utteranceStart + event.charIndex;
            const spokenWord = chunk.slice(boundary).match(/^\S+/);
            resumeCharIndex = boundary + (event.charLength || (spokenWord ? spokenWord[0].length : 0));
            const wordsInChunk = countWords(chunk.slice(0, resumeCharIndex));
            if (wordsInChunk !== lastBoundaryWordCount) {
                lastBoundaryWordCount = wordsInChunk;
                updateProgress((wordPrefixes[paragraphIndex] || 0) +
                    countWords(chunks.slice(0, chunkIndex).join(' ')) + wordsInChunk);
            }
        };
        utterance.onend = () => {
            if (version !== sessionVersion || !isReading || isPaused) return;
            resumeCharIndex = 0;
            chunkIndex += 1;
            renderCurrentChunk();
            updateProgress((wordPrefixes[paragraphIndex] || 0) +
                countWords(chunks.slice(0, chunkIndex).join(' ')));
            speakCurrentChunk();
        };
        utterance.onerror = (event) => {
            if (version !== sessionVersion || event.error === 'canceled' || event.error === 'interrupted') return;
            isReading = false;
            isPaused = false;
            updateControls();
            showMessage(`Speech could not continue (${event.error}). Try another English voice or restart.`, true);
        };

        renderCurrentChunk();
        updateControls();
        synth.speak(utterance);
    }

    function startAtParagraph(index, startChunk) {
        if (!synth) {
            showMessage('Speech synthesis is not available in this browser. Try a current version of Chrome, Edge, or Safari.', true);
            return;
        }
        if (!elements.text.value.trim()) {
            showMessage('Add some text or upload a book before starting.', true);
            return;
        }
        prepareParagraphs();
        paragraphIndex = Math.max(0, Math.min(index, paragraphs.length - 1));
        chunks = makeChunks(paragraphs[paragraphIndex]);
        chunkIndex = Math.max(0, Math.min(startChunk || 0, chunks.length - 1));
        resumeCharIndex = 0;
        sessionVersion += 1;
        synth.cancel();
        isPaused = false;
        isReading = true;
        showMessage('', false);
        updateProgress(wordPrefixes[paragraphIndex] || 0);
        speakCurrentChunk();
    }

    function loadVoices() {
        if (!synth) return;
        voices = synth.getVoices().filter((voice) => voice.lang && voice.lang.toLowerCase().startsWith('en'));
        const previouslySelected = readPreference('readwell-voice');
        elements.voice.replaceChildren();

        if (!voices.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'System English voice';
            elements.voice.append(option);
            elements.voice.disabled = true;
            return;
        }

        elements.voice.disabled = false;
        for (const voice of voices) {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} · ${voice.lang}`;
            elements.voice.append(option);
        }
        const preferred = voices.find((voice) => voice.name === previouslySelected) ||
            voices.find((voice) => voice.default && voice.lang.toLowerCase().startsWith('en')) ||
            voices.find((voice) => voice.lang.toLowerCase() === 'en-us') || voices[0];
        elements.voice.value = preferred.name;
    }

    function updateTheme(theme) {
        document.documentElement.dataset.theme = theme;
        const isDark = theme === 'dark';
        elements.themeIcon.textContent = isDark ? '☼' : '☾';
        elements.themeLabel.textContent = isDark ? 'Light appearance' : 'Dark appearance';
        elements.themeToggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
    }

    function cancelReading(resetPosition) {
        sessionVersion += 1;
        if (synth) synth.cancel();
        currentUtterance = null;
        isReading = false;
        isPaused = false;
        resumeCharIndex = 0;
        if (resetPosition) {
            paragraphIndex = 0;
            chunkIndex = 0;
            chunks = paragraphs.length ? makeChunks(paragraphs[0]) : [];
            updateProgress(0);
            if (paragraphs.length) renderCurrentChunk();
        }
        updateControls();
    }

    function normalizeEpubPath(path) {
        const parts = [];
        for (const part of path.replace(/\\/g, '/').split('/')) {
            if (!part || part === '.') continue;
            if (part === '..') {
                if (!parts.length) throw new Error('The EPUB contains an invalid file path.');
                parts.pop();
            } else {
                parts.push(part);
            }
        }
        return parts.join('/');
    }

    function resolveEpubPath(basePath, href) {
        const relativePath = decodeURIComponent(href.split(/[?#]/, 1)[0]);
        const directory = basePath ? basePath.split('/').slice(0, -1) : [];
        return normalizeEpubPath([...directory, relativePath].join('/'));
    }

    function parseEpubXml(source) {
        const parsed = new DOMParser().parseFromString(source, 'application/xml');
        if (parsed.querySelector('parsererror')) throw new Error('The EPUB package contains invalid XML.');
        return parsed;
    }

    async function extractEpubText(file) {
        if (!window.JSZip) {
            throw new Error('The EPUB reader could not load. Check your internet connection and try again.');
        }

        let archive;
        try {
            archive = await window.JSZip.loadAsync(await file.arrayBuffer());
        } catch (_error) {
            throw new Error('This EPUB could not be opened. It may be damaged or protected with DRM.');
        }

        const containerFile = archive.file('META-INF/container.xml');
        if (!containerFile) throw new Error('This is not a valid EPUB book.');
        const container = parseEpubXml(await containerFile.async('string'));
        const rootfile = container.getElementsByTagNameNS('*', 'rootfile')[0];
        const packagePath = rootfile && rootfile.getAttribute('full-path');
        if (!packagePath) throw new Error('The EPUB book is missing its package file.');

        const normalizedPackagePath = normalizeEpubPath(packagePath);
        const packageFile = archive.file(normalizedPackagePath);
        if (!packageFile) throw new Error('The EPUB package file could not be found.');
        const packageDocument = parseEpubXml(await packageFile.async('string'));
        const manifest = new Map(
            Array.from(packageDocument.getElementsByTagNameNS('*', 'item'))
                .map((item) => [item.getAttribute('id'), item])
                .filter(([id, item]) => id && item.getAttribute('href'))
        );
        const spine = Array.from(packageDocument.getElementsByTagNameNS('*', 'itemref'));
        const chapters = [];

        for (let index = 0; index < spine.length; index += 1) {
            const item = manifest.get(spine[index].getAttribute('idref'));
            if (!item || item.getAttribute('properties')?.split(/\s+/).includes('nav')) continue;
            const chapterPath = resolveEpubPath(normalizedPackagePath, item.getAttribute('href'));
            const chapterFile = archive.file(chapterPath);
            if (!chapterFile) throw new Error(`An EPUB chapter could not be found (${chapterPath}).`);

            const chapter = new DOMParser().parseFromString(await chapterFile.async('string'), 'text/html');
            const body = chapter.body;
            if (!body) continue;
            body.querySelectorAll('script, style, nav').forEach((element) => element.remove());
            const blocks = Array.from(body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre'))
                .map((element) => element.textContent.replace(/\s+/g, ' ').trim())
                .filter(Boolean);
            const text = blocks.length ? blocks.join('\n\n') : body.textContent.replace(/\s+/g, ' ').trim();
            if (text) chapters.push(text);

            if ((index + 1) % 10 === 0) {
                showUploadMessage(`Reading EPUB chapter ${index + 1} of ${spine.length}…`, false);
                await new Promise((resolve) => window.setTimeout(resolve, 0));
            }
        }

        return chapters.join('\n\n');
    }

    async function extractPdfText(file) {
        if (!window.pdfjsLib) {
            throw new Error('The PDF reader could not load. Check your internet connection and try again.');
        }

        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await window.pdfjsLib.getDocument({
            data: new Uint8Array(await file.arrayBuffer()),
        }).promise;
        const pages = [];
        let ocrWorker = null;

        try {
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                const page = await pdf.getPage(pageNumber);
                const content = await page.getTextContent();
                let pageText = content.items.map((item) => item.str || '').filter(Boolean).join(' ').trim();

                if (!pageText) {
                    if (!window.Tesseract) {
                        throw new Error('This PDF contains scanned pages, but the OCR reader could not load. Check your internet connection and retry.');
                    }
                    if (!ocrWorker) {
                        showUploadMessage('Preparing OCR for scanned pages…', false);
                        ocrWorker = await window.Tesseract.createWorker('eng', 1, {
                            logger: (progress) => {
                                if (progress.status === 'recognizing text' && progress.progress) {
                                    const percent = Math.round(progress.progress * 100);
                                    showUploadMessage(`Recognizing scanned page ${pageNumber} of ${pdf.numPages}… ${percent}%`, false);
                                } else if (progress.status === 'loading language traineddata') {
                                    showUploadMessage('Loading English OCR data for scanned pages…', false);
                                } else if (progress.status === 'initializing tesseract') {
                                    showUploadMessage('Starting OCR for scanned pages…', false);
                                }
                            },
                        });
                    }

                    showUploadMessage(`Recognizing scanned page ${pageNumber} of ${pdf.numPages}…`, false);
                    const viewport = page.getViewport({ scale: 2 });
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.ceil(viewport.width);
                    canvas.height = Math.ceil(viewport.height);
                    const context = canvas.getContext('2d', { alpha: false });
                    if (!context) throw new Error('Could not prepare a scanned PDF page for OCR.');
                    await page.render({ canvasContext: context, viewport }).promise;
                    const result = await ocrWorker.recognize(canvas);
                    pageText = result.data.text.trim();
                    canvas.width = 0;
                    canvas.height = 0;
                }

                pages.push(pageText);
                if (pageNumber % 12 === 0) {
                    showUploadMessage(`Reading page ${pageNumber} of ${pdf.numPages}…`, false);
                    await new Promise((resolve) => window.setTimeout(resolve, 0));
                }
            }
        } finally {
            if (ocrWorker) await ocrWorker.terminate();
        }

        const text = pages.filter(Boolean).join('\n\n');
        if (!text) throw new Error('No readable text was found in this PDF, even after checking its scanned pages.');
        return text;
    }

    async function extractFile(file) {
        if (!file) return;
        const extension = file.name.split('.').pop().toLowerCase();
        if (!['pdf', 'epub', 'docx', 'txt'].includes(extension)) {
            showUploadMessage('That file type is not supported. Choose a PDF, EPUB, DOCX or TXT file.', true);
            return;
        }
        if (file.size > maxFileSize) {
            showUploadMessage('This file is over 50 MB. Please choose a smaller book.', true);
            return;
        }

        showUploadMessage(`Opening ${file.name}…`, false);
        elements.dropZone.classList.add('loading');
        try {
            let text;
            if (extension === 'txt') {
                text = await file.text();
                text = text.replace(/^\uFEFF/, '');
            } else if (extension === 'epub') {
                text = await extractEpubText(file);
                if (!text.trim()) throw new Error('No readable text was found in this EPUB.');
            } else if (extension === 'pdf') {
                text = await extractPdfText(file);
            } else {
                if (!window.mammoth) throw new Error('The DOCX reader could not load. Check your internet connection and try again.');
                const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
                text = result.value;
            }

            if (!text || !text.trim()) throw new Error('No readable text was found in that file.');
            elements.text.value = text.trim();
            cancelReading(true);
            updateTextStats();
            showUploadMessage(`${file.name} is ready to read.`, false);
            showMessage('Your book is ready. Press Start reading when you’re settled.', false);
            elements.text.focus();
        } catch (error) {
            showUploadMessage(error.message || 'This document could not be processed. Try another file.', true);
        } finally {
            elements.dropZone.classList.remove('loading');
            elements.fileInput.value = '';
        }
    }

    elements.text.addEventListener('input', () => {
        cancelReading(false);
        paragraphs = [];
        chunks = [];
        window.clearTimeout(wordCountTimer);
        wordCountTimer = window.setTimeout(updateTextStats, 100);
        showMessage('', false);
    });

    elements.loadMusic.addEventListener('click', loadBackgroundMusic);
    elements.musicUrl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') loadBackgroundMusic();
    });
    elements.musicPlay.addEventListener('click', () => { if (youtubePlayer) youtubePlayer.playVideo(); });
    elements.musicPause.addEventListener('click', () => { if (youtubePlayer) youtubePlayer.pauseVideo(); });
    elements.musicStop.addEventListener('click', () => {
        if (youtubePlayer) { youtubePlayer.stopVideo(); setMusicStatus('Background music stopped.', false); }
    });
    elements.musicVolume.addEventListener('input', () => {
        const volume = Number(elements.musicVolume.value);
        elements.musicVolumeValue.textContent = `${volume}%`;
        remember('readwell-music-volume', String(volume));
        if (youtubePlayer) youtubePlayer.setVolume(volume);
    });
    elements.start.addEventListener('click', () => startAtParagraph(0, 0));
    elements.play.addEventListener('click', () => {
        if (isPaused) {
            isPaused = false;
            isReading = true;
            updateControls();
            showMessage('', false);
            speakCurrentChunk();
        } else if (!isReading) {
            if (!paragraphs.length) prepareParagraphs();
            startAtParagraph(paragraphIndex, chunkIndex);
        }
    });
    elements.pause.addEventListener('click', () => {
        if (!isReading || !synth) return;
        sessionVersion += 1;
        synth.cancel();
        isPaused = true;
        isReading = false;
        currentUtterance = null;
        updateControls();
        showMessage('Paused. Resume whenever you’re ready.', false);
    });
    elements.stop.addEventListener('click', () => {
        cancelReading(true);
        showMessage('Reading stopped. Start again whenever you like.', false);
    });
    elements.restart.addEventListener('click', () => startAtParagraph(0, 0));
    elements.previous.addEventListener('click', () => {
        if (!paragraphs.length) prepareParagraphs();
        startAtParagraph(Math.max(0, paragraphIndex - 1), 0);
    });
    elements.next.addEventListener('click', () => {
        if (!paragraphs.length) prepareParagraphs();
        startAtParagraph(Math.min(paragraphs.length - 1, paragraphIndex + 1), 0);
    });
    elements.clear.addEventListener('click', () => {
        cancelReading(true);
        elements.text.value = '';
        paragraphs = [];
        chunks = [];
        showUploadMessage('', false);
        showMessage('', false);
        updateTextStats();
    });
    elements.speed.addEventListener('change', () => {
        const rate = supportedRates.has(elements.speed.value) ? elements.speed.value : '1';
        elements.speed.value = rate;
        elements.speedValue.textContent = `${rate}×`;
        remember('readwell-speed', rate);
        if (isReading) {
            sessionVersion += 1;
            synth.cancel();
            speakCurrentChunk();
            showMessage('Speed updated.', false);
        }
    });
    elements.voice.addEventListener('change', () => {
        remember('readwell-voice', elements.voice.value);
        if (isReading) {
            sessionVersion += 1;
            synth.cancel();
            speakCurrentChunk();
            showMessage('Voice updated.', false);
        }
    });
    elements.themeToggle.addEventListener('click', () => {
        const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        updateTheme(theme);
        remember('readwell-theme', theme);
    });
    elements.shareButton.addEventListener('click', () => {
        elements.shareLink.value = publicAppUrl;
        elements.shareStatus.textContent = '';
        elements.shareQr.replaceChildren();
        try {
            if (typeof window.QRCode !== 'function') {
                throw new Error('The QR code could not be loaded. You can still copy the link below.');
            }
            new window.QRCode(elements.shareQr, {
                text: publicAppUrl,
                width: 192,
                height: 192,
                colorDark: '#26352e',
                colorLight: '#ffffff',
                correctLevel: window.QRCode.CorrectLevel.M,
            });
        } catch (error) {
            elements.shareStatus.textContent = error.message || 'The QR code could not be created. Copy the link below instead.';
        }
        elements.shareDialog.showModal();
    });
    elements.shareClose.addEventListener('click', () => elements.shareDialog.close());
    elements.shareDialog.addEventListener('click', (event) => {
        if (event.target === elements.shareDialog) elements.shareDialog.close();
    });
    elements.copyShareLink.addEventListener('click', async () => {
        elements.shareLink.select();
        try {
            if (navigator.clipboard && window.isSecureContext) {
                try {
                    await navigator.clipboard.writeText(elements.shareLink.value);
                } catch (_error) {
                    if (!document.execCommand('copy')) {
                        throw new Error('Copy was blocked. Select the link and copy it manually.');
                    }
                }
            } else if (!document.execCommand('copy')) {
                throw new Error('Copy was blocked. Select the link and copy it manually.');
            }
            elements.shareStatus.textContent = 'Link copied. Share it with anyone you like.';
        } catch (error) {
            elements.shareStatus.textContent = error instanceof Error
                ? error.message
                : 'Copy was blocked. Select the link and copy it manually.';
        }
    });
    document.getElementById('open-upload').addEventListener('click', () => elements.fileInput.click());
    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', () => extractFile(elements.fileInput.files[0]));
    for (const eventName of ['dragenter', 'dragover']) {
        elements.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            elements.dropZone.classList.add('drag-over');
        });
    }
    for (const eventName of ['dragleave', 'drop']) {
        elements.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            elements.dropZone.classList.remove('drag-over');
        });
    }
    elements.dropZone.addEventListener('drop', (event) => extractFile(event.dataTransfer.files[0]));

    const savedMusicVolume = readPreference('readwell-music-volume');
    if (savedMusicVolume !== null && Number.isInteger(Number(savedMusicVolume))) {
        const volume = Math.max(0, Math.min(100, Number(savedMusicVolume)));
        elements.musicVolume.value = String(volume);
        elements.musicVolumeValue.textContent = `${volume}%`;
    }
    const savedMusicUrl = readPreference('readwell-music-url');
    if (savedMusicUrl) elements.musicUrl.value = savedMusicUrl;

    const savedSpeed = readPreference('readwell-speed');
    if (savedSpeed && supportedRates.has(savedSpeed)) elements.speed.value = savedSpeed;
    elements.speedValue.textContent = `${elements.speed.value}×`;
    updateTheme(readPreference('readwell-theme') || 'light');
    if (synth) {
        loadVoices();
        synth.addEventListener('voiceschanged', loadVoices);
        elements.speechNote.textContent = 'Uses the English voices installed in your browser or operating system.';
    } else {
        elements.speechNote.textContent = 'Speech synthesis is unavailable in this browser. Try a current version of Chrome, Edge, or Safari.';
        elements.speechNote.classList.add('error');
    }
    updateTextStats();
    updateControls();
})();
