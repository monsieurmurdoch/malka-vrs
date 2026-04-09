import React from 'react';

/**
 * Realistic Earth visual using NASA Blue Marble imagery.
 * The flat map is projected onto a circle with CSS, and a radial
 * gradient overlay simulates 3-D curvature. An outer SVG ring
 * provides the atmospheric glow.
 */
export const EarthVisual: React.FC = () => (
    <div
        className = 'celestial-earth'
        style = {{
            position: 'absolute',
            left: -80,
            bottom: '8%',
            pointerEvents: 'none',
            width: 420,
            height: 420
        }}>
        {/* Atmospheric glow ring (SVG behind the globe) */}
        <svg
            style = {{ position: 'absolute', inset: 0 }}
            viewBox = '0 0 420 420'
            xmlns = 'http://www.w3.org/2000/svg'>
            <defs>
                <radialGradient id = 'atmos-glow' cx = '50%' cy = '50%' r = '50%'>
                    <stop offset = '72%' stopColor = '#4da6ff' stopOpacity = '0' />
                    <stop offset = '82%' stopColor = '#6dbbff' stopOpacity = '0.18' />
                    <stop offset = '92%' stopColor = '#4da6ff' stopOpacity = '0.06' />
                    <stop offset = '100%' stopColor = '#4da6ff' stopOpacity = '0' />
                </radialGradient>
            </defs>
            <circle cx = '210' cy = '210' r = '205' fill = 'url(#atmos-glow)' />
        </svg>

        {/* Globe: NASA flat map on a circle with 3-D shading overlay */}
        <div
            style = {{
                position: 'absolute',
                top: 35,
                left: 35,
                width: 350,
                height: 350,
                borderRadius: '50%',
                overflow: 'hidden',
                boxShadow: '0 0 60px rgba(77, 166, 255, 0.15), inset -8px -8px 30px rgba(0,0,0,0.4)'
            }}>
            {/* NASA Blue Marble texture */}
            <div
                style = {{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: 'url(images/earth-bluemarble.jpg)',
                    backgroundSize: '200% 100%',
                    backgroundPosition: '25% 50%',
                    borderRadius: '50%'
                }} />

            {/* 3-D curvature shading — darker edges simulate a sphere */}
            <div
                style = {{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 38% 35%, transparent 30%, rgba(0,0,0,0.25) 65%, rgba(0,0,0,0.6) 100%)'
                }} />

            {/* Specular highlight — upper-left light catch */}
            <div
                style = {{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.18) 0%, transparent 45%)'
                }} />
        </div>

        {/* Thin atmospheric rim */}
        <svg
            style = {{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            viewBox = '0 0 420 420'
            xmlns = 'http://www.w3.org/2000/svg'>
            <circle
                cx = '210'
                cy = '210'
                fill = 'none'
                r = '176'
                stroke = '#7ec8e3'
                strokeOpacity = '0.25'
                strokeWidth = '1.5' />
        </svg>
    </div>
);


/**
 * Stylized Moon illustration (SVG).
 * Silver-gray sphere with craters, subtle surface texture,
 * and a soft bluish-white glow.
 */
export const MoonVisual: React.FC = () => (
    <div
        className = 'celestial-moon'
        style = {{
            position: 'absolute',
            right: -60,
            bottom: '-2%',
            pointerEvents: 'none',
            width: 360,
            height: 360
        }}>
        <svg
            height = '360'
            viewBox = '0 0 360 360'
            width = '360'
            xmlns = 'http://www.w3.org/2000/svg'>
            <defs>
                <radialGradient cx = '50%' cy = '50%' id = 'moon-glow' r = '50%'>
                    <stop offset = '68%' stopColor = '#dce6f0' stopOpacity = '0' />
                    <stop offset = '82%' stopColor = '#dce6f0' stopOpacity = '0.12' />
                    <stop offset = '100%' stopColor = '#dce6f0' stopOpacity = '0' />
                </radialGradient>
                <radialGradient cx = '42%' cy = '38%' id = 'moon-surface' r = '52%'>
                    <stop offset = '0%' stopColor = '#e8e8e8' />
                    <stop offset = '50%' stopColor = '#c8c8c8' />
                    <stop offset = '100%' stopColor = '#9a9a9a' />
                </radialGradient>
                <radialGradient cx = '45%' cy = '40%' id = 'crater-shadow' r = '50%'>
                    <stop offset = '0%' stopColor = '#888888' />
                    <stop offset = '100%' stopColor = '#aaaaaa' />
                </radialGradient>
                <radialGradient cx = '38%' cy = '32%' id = 'moon-highlight' r = '38%'>
                    <stop offset = '0%' stopColor = '#ffffff' stopOpacity = '0.3' />
                    <stop offset = '100%' stopColor = '#ffffff' stopOpacity = '0' />
                </radialGradient>
                <clipPath id = 'moon-clip'>
                    <circle cx = '180' cy = '180' r = '135' />
                </clipPath>
            </defs>

            {/* Outer glow */}
            <circle cx = '180' cy = '180' fill = 'url(#moon-glow)' r = '170' />

            <g clipPath = 'url(#moon-clip)'>
                {/* Surface */}
                <circle cx = '180' cy = '180' fill = 'url(#moon-surface)' r = '135' />

                {/* Maria (dark regions) */}
                <ellipse cx = '160' cy = '155' fill = '#b0b0b0' opacity = '0.35' rx = '48' ry = '42' />
                <ellipse cx = '210' cy = '200' fill = '#aaaaaa' opacity = '0.3' rx = '38' ry = '32' />

                {/* Large craters */}
                <circle cx = '150' cy = '140' fill = 'url(#crater-shadow)' opacity = '0.4' r = '20' />
                <ellipse cx = '150' cy = '139' fill = '#c0c0c0' opacity = '0.5' rx = '19' ry = '18' />

                <circle cx = '215' cy = '175' fill = 'url(#crater-shadow)' opacity = '0.35' r = '16' />
                <ellipse cx = '215' cy = '174' fill = '#bdbdbd' opacity = '0.45' rx = '15' ry = '14' />

                <circle cx = '175' cy = '225' fill = 'url(#crater-shadow)' opacity = '0.3' r = '22' />
                <ellipse cx = '175' cy = '224' fill = '#c4c4c4' opacity = '0.4' rx = '21' ry = '20' />

                {/* Small craters */}
                <circle cx = '130' cy = '185' fill = '#a8a8a8' opacity = '0.35' r = '8' />
                <circle cx = '200' cy = '135' fill = '#a8a8a8' opacity = '0.3' r = '7' />
                <circle cx = '235' cy = '215' fill = '#a5a5a5' opacity = '0.3' r = '9' />
                <circle cx = '160' cy = '265' fill = '#a8a8a8' opacity = '0.25' r = '6' />
                <circle cx = '205' cy = '255' fill = '#aaaaaa' opacity = '0.28' r = '10' />
                <circle cx = '135' cy = '235' fill = '#a6a6a6' opacity = '0.25' r = '7' />

                {/* Tiny detail dots */}
                <circle cx = '165' cy = '165' fill = '#9e9e9e' opacity = '0.25' r = '3' />
                <circle cx = '225' cy = '150' fill = '#9e9e9e' opacity = '0.2' r = '2.5' />
                <circle cx = '190' cy = '205' fill = '#a0a0a0' opacity = '0.22' r = '3.5' />
            </g>

            {/* Specular highlight */}
            <circle cx = '180' cy = '180' fill = 'url(#moon-highlight)' r = '135' />

            {/* Rim */}
            <circle
                cx = '180'
                cy = '180'
                fill = 'none'
                r = '134'
                stroke = '#d4e4f7'
                strokeOpacity = '0.25'
                strokeWidth = '1.2' />
        </svg>
    </div>
);
