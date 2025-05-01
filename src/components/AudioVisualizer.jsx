import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Settings } from 'lucide-react';

export default function AudioVisualizer() {
  const [audioFile, setAudioFile] = useState(null);
  const [audioContext, setAudioContext] = useState(null);
  const [audioBuffer, setAudioBuffer] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioSource, setAudioSource] = useState(null);
  const [visualizationMode, setVisualizationMode] = useState("dynamic-shapes");
  const [colorScheme, setColorScheme] = useState("neon");
  const [musicMood, setMusicMood] = useState("energetic");
  const [showSettings, setShowSettings] = useState(false);
  const [spiralConfig, setSpiralConfig] = useState({
    density: 20,
    speed: 1,
    expansion: 1
  });
  const [gridConfig, setGridConfig] = useState({
    rows: 8,
    columns: 12,
    spacing: 1
  });

  const canvasRef = useRef(null);
  const analyzerRef = useRef(null);
  const rafIdRef = useRef(null);

  const animationState = useRef({
    shapes: [],
    backgroundHue: 0,
    lastBeatTime: 0,
    beatDetected: false,
    energyHistory: [],
    bassPeaks: [],
    lastFrameTime: 0,
    colorCycle: 0
  });

  useEffect(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    setAudioContext(context);

    const analyzer = context.createAnalyser();
    analyzer.fftSize = 2048;
    analyzerRef.current = analyzer;

    return () => {
      if (context.state !== 'closed') {
        context.close();
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAudioFile(file);

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
          setAudioBuffer(decodedBuffer);
        } catch (error) {
          console.error("Error decoding audio data", error);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const togglePlayback = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  };

  const startPlayback = () => {
    if (!audioBuffer || !audioContext) return;

    if (audioSource) {
      audioSource.stop();
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    const analyzer = analyzerRef.current;
    source.connect(analyzer);
    analyzer.connect(audioContext.destination);

    source.start(0);
    setAudioSource(source);
    setIsPlaying(true);

    drawVisualization();
  };

  const stopPlayback = () => {
    if (audioSource) {
      audioSource.stop();
      setAudioSource(null);
    }
    setIsPlaying(false);

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  };

  const drawVisualization = () => {
    if (!analyzerRef.current || !canvasRef.current) return;

    const analyzer = analyzerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const bufferLength = analyzer.frequencyBinCount;
    const frequencyData = new Uint8Array(bufferLength);
    const timeData = new Uint8Array(bufferLength);

    analyzer.getByteFrequencyData(frequencyData);
    analyzer.getByteTimeDomainData(timeData);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background first
    updateBackground(ctx, canvas, musicMood, frequencyData);

    // Draw visualizations based on selected mode
    switch (visualizationMode) {
      case "shape-spiral":
        drawShapeSpiral(ctx, frequencyData, timeData, canvas);
        break;
      case "ordered-grid":
        drawOrderedGrid(ctx, frequencyData, timeData, canvas);
        break;
      case "dynamic-shapes":
      default:
        drawDynamicShapes(ctx, frequencyData, timeData, canvas);
        break;
    }

    rafIdRef.current = requestAnimationFrame(drawVisualization);
  };

  const drawDynamicShapes = (ctx, frequencyData, timeData, canvas) => {
    const currentTime = performance.now();
    const deltaTime = currentTime - animationState.current.lastFrameTime;
    animationState.current.lastFrameTime = currentTime;

    const beatDetected = detectBeat(frequencyData, currentTime);

    if (beatDetected) {
      createShapesOnBeat(frequencyData, canvas);
    }

    updateAndDrawShapes(ctx, frequencyData, deltaTime, canvas);
    animationState.current.colorCycle = (animationState.current.colorCycle + deltaTime * 0.05) % 360;
  };
  
  const drawShapeSpiral = (ctx, frequencyData, timeData, canvas) => {
    const currentTime = performance.now();
    const deltaTime = currentTime - animationState.current.lastFrameTime;
    animationState.current.lastFrameTime = currentTime;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Get energy from different frequency bands
    const bassEnergy = frequencyData.slice(0, 60).reduce((sum, val) => sum + val, 0) / 60 / 255;
    const midEnergy = frequencyData.slice(60, 120).reduce((sum, val) => sum + val, 0) / 60 / 255;
    const highEnergy = frequencyData.slice(120, 200).reduce((sum, val) => sum + val, 0) / 80 / 255;
    
    // Spiral parameters
    const maxRadius = Math.min(canvas.width, canvas.height) * 0.45;
    const spiralDensity = spiralConfig.density * (1 + bassEnergy * 0.5);
    const rotationSpeed = spiralConfig.speed * (1 + midEnergy * 2);
    const expansionRate = spiralConfig.expansion * (1 + highEnergy * 0.5);
    
    // Update spiral animation
    animationState.current.colorCycle = (animationState.current.colorCycle + deltaTime * 0.05 * rotationSpeed) % 360;
    
    // Create spiral pattern
    for (let i = 0; i < spiralDensity * 15; i++) {
      const angle = (i / spiralDensity) * Math.PI * 2 + (currentTime / 1000) * rotationSpeed;
      const radius = (i / spiralDensity) * maxRadius * expansionRate;
      
      if (radius > maxRadius) continue;
      
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      
      // Size and opacity based on frequency and position
      const freqIndex = Math.floor((i / (spiralDensity * 15)) * frequencyData.length);
      const freqValue = frequencyData[freqIndex] || 0;
      const normalizedValue = freqValue / 255;
      
      const size = 2 + normalizedValue * 15;
      const opacity = 0.2 + normalizedValue * 0.8;
      
      // Color based on position in spiral and energy
      let hue = (animationState.current.colorCycle + (i / spiralDensity) * 30) % 360;
      let saturation = 70 + midEnergy * 30;
      let lightness = 40 + normalizedValue * 30;
      
      ctx.globalAlpha = opacity;
      
      // Alternate between circle and square shapes
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 4);
        ctx.fillStyle = `hsl(${(hue + 30) % 360}, ${saturation}%, ${lightness}%)`;
        ctx.fillRect(-size/2, -size/2, size, size);
        ctx.restore();
      }
    }
    
    ctx.globalAlpha = 1;
    
    // Draw a pulsing circle at the center
    const beatDetected = detectBeat(frequencyData, currentTime);
    if (beatDetected) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, 10 + bassEnergy * 40, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${animationState.current.colorCycle}, 100%, 70%, ${0.4 + bassEnergy * 0.6})`;
      ctx.fill();
    }
  };

  const createShapesOnBeat = (frequencyData, canvas) => {
    const bassIntensity = Math.max(...frequencyData.slice(0, 60)) / 255;
    const midIntensity = Math.max(...frequencyData.slice(60, 120)) / 255;
    
    // Create multiple shapes with different properties
    for (let i = 0; i < 3; i++) {
      let shapeType = Math.random() > 0.5 ? 'circle' : 'square';
      
      animationState.current.shapes.push({
        type: shapeType,
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 5 + bassIntensity * 40 + Math.random() * 20,
        color: getColor(Math.random() * 100, 230, 100),
        alpha: 1,
        velocity: { 
          x: (Math.random() - 0.5) * (2 + bassIntensity * 3), 
          y: (Math.random() - 0.5) * (2 + midIntensity * 3) 
        },
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
        lifespan: 2000 + Math.random() * 1000,
        createdAt: performance.now()
      });
    }

    if (animationState.current.shapes.length > 180) {
      animationState.current.shapes = animationState.current.shapes.slice(-180);
    }
  };

  const updateAndDrawShapes = (ctx, frequencyData, deltaTime, canvas) => {
    const currentTime = performance.now();
    const shapes = animationState.current.shapes;

    for (let i = shapes.length - 1; i >= 0; i--) {
      const shape = shapes[i];
      const age = currentTime - shape.createdAt;

      if (age > shape.lifespan) {
        shapes.splice(i, 1);
        continue;
      }

      // Update position
      shape.x += shape.velocity.x * deltaTime * 0.06;
      shape.y += shape.velocity.y * deltaTime * 0.06;
      
      // Update rotation
      if (shape.rotationSpeed) {
        shape.rotation += shape.rotationSpeed * deltaTime * 0.01;
      }

      // Fade out based on age
      shape.alpha = 1 - (age / shape.lifespan);

      // Handle edge bouncing
      if (shape.x < 0 || shape.x > canvas.width) shape.velocity.x *= -0.8;
      if (shape.y < 0 || shape.y > canvas.height) shape.velocity.y *= -0.8;

      ctx.globalAlpha = shape.alpha;
      ctx.save();
      ctx.translate(shape.x, shape.y);
      ctx.rotate(shape.rotation);

      if (shape.type === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, shape.size, 0, Math.PI * 2);
        ctx.fillStyle = shape.color;
        ctx.fill();
      } else if (shape.type === 'square') {
        ctx.fillStyle = shape.color;
        ctx.fillRect(-shape.size/2, -shape.size/2, shape.size, shape.size);
      }

      ctx.restore();
    }

    ctx.globalAlpha = 1;
  };

  const updateBackground = (ctx, canvas, mood, frequencyData) => {
    // Create a gradient background that responds to the music
    const bassEnergy = frequencyData.slice(0, 60).reduce((sum, val) => sum + val, 0) / 60 / 255;
    const midEnergy = frequencyData.slice(60, 120).reduce((sum, val) => sum + val, 0) / 60 / 255;
    
    animationState.current.backgroundHue = (animationState.current.backgroundHue + 0.2) % 360;
    
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, 
      canvas.height / 2, 
      0, 
      canvas.width / 2, 
      canvas.height / 2, 
      canvas.width * (0.6 + bassEnergy * 0.4)
    );
    
    // Color based on energy and selected scheme
    let baseHue = animationState.current.backgroundHue;
    let saturation = 70 + midEnergy * 30;
    let lightness = 5 + bassEnergy * 15;
    
    if (colorScheme === "neon") {
      gradient.addColorStop(0, `hsla(${baseHue}, ${saturation}%, ${lightness + 20}%, 1)`);
      gradient.addColorStop(0.6, `hsla(${(baseHue + 30) % 360}, ${saturation - 10}%, ${lightness + 5}%, 0.8)`);
      gradient.addColorStop(1, `hsla(${(baseHue + 60) % 360}, ${saturation - 20}%, ${lightness}%, 0.9)`);
    } else if (colorScheme === "ocean") {
      gradient.addColorStop(0, `hsla(${180 + bassEnergy * 30}, ${saturation}%, ${lightness + 15}%, 1)`);
      gradient.addColorStop(0.7, `hsla(${200 + bassEnergy * 20}, ${saturation - 10}%, ${lightness + 5}%, 0.8)`);
      gradient.addColorStop(1, `hsla(220, ${saturation - 20}%, ${lightness}%, 0.9)`);
    } else if (colorScheme === "fire") {
      gradient.addColorStop(0, `hsla(${10 + bassEnergy * 20}, ${saturation + 20}%, ${lightness + 25}%, 1)`);
      gradient.addColorStop(0.6, `hsla(${20 + bassEnergy * 10}, ${saturation + 10}%, ${lightness + 10}%, 0.8)`);
      gradient.addColorStop(1, `hsla(30, ${saturation}%, ${lightness}%, 0.9)`);
    } else {
      // Rainbow or default
      gradient.addColorStop(0, `hsla(${baseHue}, ${saturation}%, ${lightness + 20}%, 1)`);
      gradient.addColorStop(0.5, `hsla(${(baseHue + 120) % 360}, ${saturation - 10}%, ${lightness + 5}%, 0.8)`);
      gradient.addColorStop(1, `hsla(${(baseHue + 240) % 360}, ${saturation - 20}%, ${lightness}%, 0.9)`);
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const detectBeat = (frequencyData, time) => {
    const bassEnergy = frequencyData.slice(0, 60).reduce((sum, val) => sum + val, 0) / 60;
    animationState.current.bassPeaks.push(bassEnergy);

    if (animationState.current.bassPeaks.length > 30) {
      animationState.current.bassPeaks.shift();
    }

    const avgBass = animationState.current.bassPeaks.reduce((sum, val) => sum + val, 0) / animationState.current.bassPeaks.length;
    const stdDev = Math.sqrt(animationState.current.bassPeaks.reduce((sum, val) => sum + Math.pow(val - avgBass, 2), 0) / animationState.current.bassPeaks.length);

    const threshold = 1.2;
    const beatEnergyThreshold = avgBass + (stdDev * threshold);
    const timeSinceLastBeat = time - animationState.current.lastBeatTime;

    if (bassEnergy > beatEnergyThreshold && timeSinceLastBeat > 250) {
      animationState.current.lastBeatTime = time;
      return true;
    }

    return false;
  };

  const getColor = (index, value, total) => {
    let color;
    switch (colorScheme) {
      case "rainbow":
        color = `hsl(${(index / total) * 360}, 100%, ${Math.min(value, 80)}%)`;
        break;
      case "ocean":
        color = `hsl(${180 + (index / total) * 60}, 80%, ${Math.min(value, 60)}%)`;
        break;
      case "fire":
        color = `hsl(${(index / total) * 60}, 100%, ${Math.min(value, 60)}%)`;
        break;
      case "neon":
        color = value > 200
          ? `hsl(${(index / total) * 360}, 100%, 70%)`
          : `rgba(${(index / total) * 255}, ${(index / total) * 127}, 255, 0.7)`;
        break;
      default:
        color = `hsl(${(index / total) * 360}, 100%, 50%)`;
    }
    return color;
  };

  // Final render
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-6">Audio Visualizer</h1>
      
      <div className="w-full max-w-4xl bg-gray-800 rounded-lg p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
          <div className="flex items-center mb-4 sm:mb-0">
            <label className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded cursor-pointer">
              <span>Choose Audio File</span>
              <input 
                type="file" 
                accept="audio/*" 
                onChange={handleFileUpload} 
                className="hidden" 
              />
            </label>
            <span className="ml-4 text-gray-300">
              {audioFile ? audioFile.name : 'No file selected'}
            </span>
          </div>
          
          <div className="flex items-center">
            <button 
              onClick={togglePlayback} 
              disabled={!audioBuffer}
              className={`flex items-center justify-center w-12 h-12 rounded-full ${audioBuffer ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 cursor-not-allowed'}`}
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className="ml-4 flex items-center justify-center w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
        
        {showSettings && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 bg-gray-700 p-4 rounded-md">
            <div>
              <label className="block text-sm font-medium mb-1">Visualization Type</label>
              <select 
                value={visualizationMode} 
                onChange={(e) => setVisualizationMode(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
              >
                <option value="dynamic-shapes">Dynamic Shapes</option>
                <option value="shape-spiral">Shape Spiral</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Color Scheme</label>
              <select 
                value={colorScheme} 
                onChange={(e) => setColorScheme(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
              >
                <option value="neon">Neon</option>
                <option value="rainbow">Rainbow</option>
                <option value="ocean">Ocean</option>
                <option value="fire">Fire</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Music Mood</label>
              <select 
                value={musicMood} 
                onChange={(e) => setMusicMood(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
              >
                <option value="energetic">Energetic</option>
                <option value="calm">Calm</option>
                <option value="ambient">Ambient</option>
              </select>
            </div>
            
            {visualizationMode === "shape-spiral" && (
              <div>
                <label className="block text-sm font-medium mb-1">Spiral Density</label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={spiralConfig.density}
                  onChange={(e) => setSpiralConfig({...spiralConfig, density: Number(e.target.value)})}
                  className="w-full bg-gray-800 rounded"
                />
              </div>
            )}
          </div>
        )}
        
        <div className="relative w-full aspect-video">
          <canvas 
            ref={canvasRef} 
            className="w-full h-full rounded-lg border-2 border-gray-700 shadow-xl"
          />
          
          {!audioBuffer && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 rounded-lg">
              <p className="text-xl">Upload and play an audio file to start visualization</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

