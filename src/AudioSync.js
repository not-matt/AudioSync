import FFT from './fft.js';

/*
 Based on Wavesurfer's spectrogram plugin
 https://github.com/wavesurfer-js/wavesurfer.js/tree/master/src/plugin/spectrogram
*/

export default class AudioSyncPlugin {
    /**
     * AudioSync plugin definition factory
     *
     * This function must be used to create a plugin definition which can be
     * used by wavesurfer to correctly instantiate the plugin.
     *
     * @param  {AudioSyncPluginParams} params Parameters used to initialise the plugin
     * @return {PluginDefinition} An object representing the plugin.
     */
    static create(params) {
        return {
            name: 'audiosync',
            deferInit: params && params.deferInit ? params.deferInit : false,
            params: params,
            staticProps: {
                FFT: FFT
            },
            instance: AudioSyncPlugin
        };
    }

    constructor(params, ws) {
        this.params = params;
        this.wavesurfer = ws;
        this.util = ws.util;

        this.frequenciesDataUrl = params.frequenciesDataUrl;
        this._onScroll = e => {
            this.updateScroll(e);
        };
        this._onRender = () => {
            this.render();
        };
        this._onWrapperClick = e => {
            this._wrapperClickHandler(e);
        };
        this._onReady = () => {
            const drawer = (this.drawer = ws.drawer);

            this.container =
                'string' == typeof params.container
                    ? document.querySelector(params.container)
                    : params.container;

            if (!this.container) {
                throw Error('No container for WaveSurfer spectrogram');
            }

            this.width = drawer.width;
            this.pixelRatio = this.params.pixelRatio || ws.params.pixelRatio;
            this.fftSamples = this.params.fftSamples || ws.params.fftSamples || 512;
            this.height = this.params.height || 450;
            this.noverlap = params.noverlap;
            this.windowFunc = params.windowFunc;
            this.alpha = params.alpha;
            this.splitChannels = params.splitChannels;
            this.channels = this.splitChannels ? ws.backend.buffer.numberOfChannels : 1;

            // Define variables and parameters
            this.settings = this.params.settings;
            console.log(this.settings)
            this.featureHistory = [];
            this.cooldownCounter = 0;
            this.shortAverageVector = null;
            this.longAverageVector = null;
            this.featuresData = [];

            this.createWrapper();
            this.createCanvas();
            this.render();

            drawer.wrapper.addEventListener('scroll', this._onScroll);
            ws.on('redraw', this._onRender);
        };
    }

    updateSettings(settings) {
        this.settings = settings;
        console.log(this.settings)
        this.drawSpectralFeatures();
    }

    init() {
        // Check if wavesurfer is ready
        if (this.wavesurfer.isReady) {
            this._onReady();
        } else {
            this.wavesurfer.once('ready', this._onReady);
        }
    }

    destroy() {
        this.unAll();
        this.wavesurfer.un('ready', this._onReady);
        this.wavesurfer.un('redraw', this._onRender);
        this.drawer && this.drawer.wrapper.removeEventListener('scroll', this._onScroll);
        this.wavesurfer = null;
        this.util = null;
        this.params = null;
        if (this.wrapper) {
            this.wrapper.removeEventListener('click', this._onWrapperClick);
            this.wrapper.parentNode.removeChild(this.wrapper);
            this.wrapper = null;
        }
    }

    createWrapper() {
        const oldWrapper = this.container.querySelector('AudioSync');
        if (oldWrapper) {
            this.container.removeChild(oldWrapper);
        }
        const wsParams = this.wavesurfer.params;
        this.wrapper = document.createElement('AudioSync');

        this.drawer.style(this.wrapper, {
            display: 'block',
            position: 'relative',
            userSelect: 'none',
            webkitUserSelect: 'none',
            height: `${this.height}px`
        });

        if (wsParams.fillParent || wsParams.scrollParent) {
            this.drawer.style(this.wrapper, {
                width: '100%',
                overflowX: 'hidden',
                overflowY: 'hidden'
            });
        }
        this.container.appendChild(this.wrapper);

        this.wrapper.addEventListener('click', this._onWrapperClick);
    }

    _wrapperClickHandler(event) {
        event.preventDefault();
        const relX = 'offsetX' in event ? event.offsetX : event.layerX;
        this.fireEvent('click', relX / this.width || 0);
    }

    createCanvas() {
        const specCanvas = (this.specCanvas = this.wrapper.appendChild(
            document.createElement('canvas')
        ));
        const overlayCanvas = (this.overlayCanvas = this.wrapper.appendChild(
            document.createElement('canvas')
        ));

        this.spectrCc = specCanvas.getContext('2d');
        this.overlayCc = overlayCanvas.getContext('2d');

        this.util.style(specCanvas, {
            zIndex: 4,
            position: 'absolute',
            top: '0px',
            left: '0px',
        });
        this.util.style(overlayCanvas, {
            zIndex: 4,
            position: 'absolute',
            top: '0px',
            left: '0px',
        });
    }

    render() {
        this.updateCanvasStyle();

        if (this.frequenciesDataUrl) {
            this.loadFrequenciesData(this.frequenciesDataUrl);
        } else {
            this.calculateSpectralFeatures();
        }
    }

    calculateSpectralFeatures() {
        const fftSamples = this.fftSamples;
        const buffer = this.wavesurfer.backend.buffer;
        const channels = this.channels;

        if (!buffer) {
            this.fireEvent('error', 'Web Audio buffer is not available');
            return;
        }

        const sampleRate = buffer.sampleRate;
        this.featuresData = [];

        let noverlap = this.noverlap;
        if (!noverlap) {
            const uniqueSamplesPerPx = buffer.length / this.specCanvas.width;
            noverlap = Math.max(0, Math.round(fftSamples - uniqueSamplesPerPx));
        }

        const fft = new FFT(fftSamples, sampleRate, this.windowFunc, this.alpha);

        for (let c = 0; c < channels; c++) {

            const channelData = buffer.getChannelData(c);
            const channelFeatures = [];

            let currentOffset = 0;

            while (currentOffset + fftSamples < channelData.length) {
                const segment = channelData.slice(
                    currentOffset,
                    currentOffset + fftSamples
                );
                const spectrum = fft.calculateSpectrum(segment);

                const features = {
                    spectrum: spectrum,
                    lfc: null,
                    zcr: null,
                    energy: null,
                };

                features.lfc = this.calculateLFC(spectrum);
                features.zcr = this.calculateZeroCrossingRate(segment);
                features.energy = this.calculateEnergy(segment);

                channelFeatures.push(features);

                currentOffset += fftSamples - noverlap;
            }

            this.featuresData.push(channelFeatures);
        }

        this.drawSpectralFeatures();
    }

    calculateZeroCrossingRate(frame) {
        let zcr = 0;
        for (let i = 0; i < frame.length - 1; i++) {
            if (frame[i] * frame[i + 1] < 0) {
                zcr++;
            }
        }
        return zcr;
    }

    calculateEnergy(frame) {
        let energy = 0;
        for (let i = 0; i < frame.length; i++) {
            energy += frame[i] * frame[i];
        }
        return energy;
    }

    calculateLFC(spectrum) {
        const startIndex = 0;
        const endIndex = Math.ceil(spectrum.length * 0.05);

        let sum = 0;
        let total = 0;

        for (let i = startIndex; i <= endIndex; i++) {
            sum += spectrum[i];
            total += 1;
        }

        return total > 0 ? sum / total : 0;
    }

    // Function to update the vector feature rolling averages
    updateFeatureHistory(currentVector) {
        this.featureHistory.unshift(currentVector);

        if (this.featureHistory.length > this.settings.windowSize) {
            const removedVector = this.featureHistory.pop();
            const shortVector = this.featureHistory[this.settings.shortWindowSize];

            // Update the rolling average vectors
            for (let i = 0; i < this.longAverageVector.length; i++) {
                this.shortAverageVector[i] = this.shortAverageVector[i] - shortVector[i] + currentVector[i];
                this.longAverageVector[i] = this.longAverageVector[i] - removedVector[i] + shortVector[i];
            }
        } else {
            this.longAverageVector = Array.from(currentVector);
            this.shortAverageVector = Array.from(currentVector);
        }
    }

    // Function to calculate the squared distance between two vectors
    // This is like euclidian distance, but by skipping the sqrt and comparing squared values, we can save some processing power
    calculateSquaredDistance(vector1, vector2) {
        let sum = 0;
        for (let i = 0; i < vector1.length; i++) {
            sum += Math.pow(vector1[i] - vector2[i], 2);
        }
        return Math.pow(sum, 2);
    }

    drawSpectralFeatures() {
        const featuresData = this.featuresData;
        const spectrCc = this.spectrCc;
        const height = this.height;
        const width = this.width;
        const ratio = this.settings.shortWindowSize / (this.settings.windowSize - this.settings.shortWindowSize);
        const shortScale = 255 * 0.57735 / this.settings.shortWindowSize // 1 / sqrt(3), the diagonal of a unit cube
        const longScale = 255 * 0.57735 / (this.settings.windowSize - this.settings.shortWindowSize) // 1 / sqrt(3), the diagonal of a unit cube

        console.log(ratio, shortScale, longScale)
        let squaredDistances = [];
        this.featureHistory = []; // reset the feature history

        console.log(shortScale, longScale)

        const maxLFC = Math.max(
            ...featuresData.flatMap(channel => channel.flatMap(frame => frame.lfc))
        );
        const maxZCR = Math.max(
            ...featuresData.flatMap(channel => channel.flatMap(frame => frame.zcr))
        );
        const maxEnergy = Math.max(
            ...featuresData.flatMap(channel => channel.flatMap(frame => frame.energy))
        );

        if (!spectrCc) {
            throw new Error('No canvas context to draw spectrogram or overlay');
        }

        spectrCc.clearRect(0, 0, width, height);

        for (let c = 0; c < featuresData.length; c++) {
            const channelData = featuresData[c];

            for (let i = 0; i < channelData.length; i++) {
                const frame = channelData[i];
                const x = i * (width / channelData.length);

                // Scale the features to between 0 and 1
                const lfc = frame.lfc / maxLFC;
                const zcr = frame.zcr / maxZCR;
                const energy = frame.energy / maxEnergy;

                // Combine the features into a three-dimensional vector
                const currentVector = [lfc, energy, zcr];

                // Update the rolling window of feature vectors
                this.updateFeatureHistory(currentVector);

                // Change detection algorithm
                // Update the cooldown counter
                if (this.cooldownCounter > 0) {
                    this.cooldownCounter *= 0.998;
                }

                // Calculate the squared distance between the short and long rolling average vectors
                // multiple this.longAverageVector by ratio to account for the difference in window sizes
                const squaredDistance = this.calculateSquaredDistance(this.shortAverageVector, this.longAverageVector.map(x => x * ratio));
                squaredDistances.push(squaredDistance)

                // Calculate the threshold for a significant change based on the cooldown duration
                const threshold = this.cooldownCounter; // Adjust the threshold as needed
                const triggered = squaredDistance > threshold

                // Draw the three spectral features in the top quarter of the canvas
                const lfcColor = "255, 0, 0"
                const zcrColor = "0, 255, 0"
                const energyColor = "0, 0, 255"

                const stackHeight = height / 4 / 3
                const lfcBarHeight = lfc * stackHeight;
                const lfcY = stackHeight - lfcBarHeight
                const zcrBarHeight = zcr * stackHeight;
                const zcrY = stackHeight * 2 - zcrBarHeight
                const energyBarHeight = energy * stackHeight;
                const energyY = stackHeight * 3 - energyBarHeight

                spectrCc.fillStyle = `rgba(${lfcColor}, ${lfcBarHeight / stackHeight})`;
                spectrCc.fillRect(x, lfcY, 1, lfcBarHeight);
                spectrCc.fillStyle = `rgba(${zcrColor}, ${zcrBarHeight / stackHeight})`;
                spectrCc.fillRect(x, zcrY, 1, zcrBarHeight);
                spectrCc.fillStyle = `rgba(${energyColor}, ${energyBarHeight / stackHeight})`;
                spectrCc.fillRect(x, energyY, 1, energyBarHeight);

                // Draw the spectral feature vector as a colour
                spectrCc.fillStyle = `rgba(${this.shortAverageVector[0] * shortScale}, ${this.shortAverageVector[1] * shortScale}, ${this.shortAverageVector[2] * shortScale}, 1)`;
                spectrCc.fillRect(x, height * 1/4, 1, height * 1/4);
                spectrCc.fillStyle = `rgba(${this.longAverageVector[0] * longScale}, ${this.longAverageVector[1] * longScale}, ${this.longAverageVector[2] * longScale}, 1)`;
                spectrCc.fillRect(x, height * 2/4, 1, height * 1/4);

                // if (triggered) {
                //     // reset the cooldown counter
                //     this.cooldownCounter = 65535
                //     // Draw a white line if a change was detected
                //     spectrCc.fillStyle = 'white';
                //     spectrCc.fillRect(x, 0, 1, height);
                // }

                // // Draw the cooldown counter as a transparent white line
                // const cooldownBarHeight = this.cooldownCounter / 65535 * height * 0.5;
                // const cooldownBarY = height - cooldownBarHeight;
                // spectrCc.fillStyle = `rgba(255, 255, 255, ${this.cooldownCounter / 65535})`;
                // spectrCc.fillRect(x, cooldownBarY, 1, cooldownBarHeight);

            }
        }

        // set the last 5% to zero to avoid the graph being dominated by the cooldown period
        squaredDistances = squaredDistances.map((x, i) => i > squaredDistances.length * 0.95 ? 0 : x)

        // Draw the squared distance as solid red bars in the lower quarter of the canvas
        console.log(squaredDistances)
        const maxSquaredDistance = Math.max(...squaredDistances)
        for (let i = 0; i < squaredDistances.length; i++) {
            const x = i * (width / squaredDistances.length);
            const y = height * 3 / 4;
            const barHeight = squaredDistances[i] / maxSquaredDistance * height / 4;
            const barY = y + height / 4 - barHeight;
            spectrCc.fillStyle = `rgba(255, 0, 0, 1)`;
            spectrCc.fillRect(x, barY, 1, barHeight);
        }

        // Draw the legend
        const legendX = 10;
        spectrCc.fillStyle = 'black';
        spectrCc.font = '20px Arial';
        spectrCc.fillText('LFC', legendX, 30);
        spectrCc.fillText('ZCR', legendX, height/12 + 30);
        spectrCc.fillText('Energy', legendX, height/12 * 2 + 30);
        spectrCc.fillStyle = 'white';
        spectrCc.fillText('Short Rolling Average', legendX, height/4 + 30);
        spectrCc.fillText('(Feature Vector visualised as RGB)', legendX, height/4 + 60);
        spectrCc.fillText('Long Rolling Average', legendX, height/2 + 60);
        spectrCc.fillStyle = 'black';
        spectrCc.fillText('Change Detection', legendX, height/4 * 3 + 30);
        spectrCc.fillText('(Euclidean Distance between Short and Long Rolling Averages)', legendX, height/4 * 3 + 60);

        // Update playback position overlay
        this.updatePlaybackLine();
    }

    updatePlaybackLine() {
        if (!this.wavesurfer) {
            return;
        }

        const overlayCc = this.overlayCc
        const height = this.height;
        const playbackPos = this.wavesurfer.backend.getCurrentTime() * this.width / this.wavesurfer.getDuration();

        // Clear previous overlay
        overlayCc.clearRect(0, 0, this.width, height);
        overlayCc.beginPath();
        overlayCc.moveTo(playbackPos, 0);
        overlayCc.lineTo(playbackPos, height);
        overlayCc.strokeStyle = 'rgba(0,0,0,1)';
        overlayCc.lineWidth = 2;
        overlayCc.stroke();
        // Request animation frame for continuous updating
        requestAnimationFrame(() => this.updatePlaybackLine());
    }

    updateCanvasStyle() {
        const width = Math.round(this.width / this.pixelRatio) + 'px';
        this.specCanvas.width = this.width;
        this.specCanvas.height = this.height;
        this.specCanvas.style.width = width;
        this.specCanvas.style.height = this.height + 'px';
        this.overlayCanvas.width = this.width;
        this.overlayCanvas.height = this.height;
        this.overlayCanvas.style.width = width;
        this.overlayCanvas.style.height = this.height + 'px';
    }

    loadFrequenciesData(url) {
        const request = this.util.fetchFile({ url: url });

        request.on('success', data =>
            this.calculateSpectralFeatures(JSON.parse(data), this)
        );
        request.on('error', e => this.fireEvent('error', e));

        return request;
    }

    updateScroll(e) {
        if (this.wrapper) {
            this.wrapper.scrollLeft = e.target.scrollLeft;
        }
    }
}