# MeepleUp Landing Page

This is the landing page for meepleUp.com, designed to be hosted on GitHub Pages.

## Setup for GitHub Pages

1. **Enable GitHub Pages in your repository:**
   - Go to your repository settings
   - Navigate to "Pages" in the left sidebar
   - Under "Source", select "Deploy from a branch"
   - Choose the `main` (or `master`) branch
   - Select the `/docs` folder
   - Click "Save"

2. **Your site will be available at:**
   - `https://[your-username].github.io/MeepleUp/`
   - Or if you have a custom domain: `https://meepleUp.com`

## Custom Domain Setup

If you want to use `meepleUp.com`:

1. Add a `CNAME` file in the `docs/` folder with your domain:
   ```
   meepleUp.com
   ```

2. Configure DNS:
   - Add a CNAME record pointing `meepleUp.com` to `[your-username].github.io`
   - Or use A records pointing to GitHub's IP addresses

3. In GitHub repository settings → Pages, add your custom domain

## File Structure

```
docs/
├── index.html      # Main landing page
├── styles.css      # All styles
├── script.js       # Interactive features
├── images/         # Copy images here (see Image Setup below)
└── README.md       # This file
```

## Image Setup

GitHub Pages may not serve files outside the `/docs` folder. You have two options:

### Option 1: Copy Images to docs folder (Recommended)

1. Create an `images` folder in `docs/`:
   ```bash
   mkdir docs/images
   ```

2. Copy the required images:
   ```bash
   cp assets/images/app-icon.png docs/images/
   cp assets/images/bgg-logo-color.png docs/images/
   ```

3. Update image paths in `index.html`:
   - Change `../assets/images/app-icon.png` to `images/app-icon.png`
   - Change `../assets/images/bgg-logo-color.png` to `images/bgg-logo-color.png`

### Option 2: Use GitHub Raw URLs

Update image paths to use GitHub raw URLs:
- `https://raw.githubusercontent.com/[your-username]/MeepleUp/main/assets/images/app-icon.png`
- `https://raw.githubusercontent.com/[your-username]/MeepleUp/main/assets/images/bgg-logo-color.png`

## Features

- ✅ Fully responsive design
- ✅ Modern, clean UI
- ✅ Smooth scrolling navigation
- ✅ Fade-in animations
- ✅ Mobile-first approach
- ✅ SEO-friendly structure

## Customization

You can customize:
- Colors in `styles.css` (CSS variables in `:root`)
- Content in `index.html`
- Animations in `script.js`

## Testing Locally

You can test the landing page locally by:

1. Using a simple HTTP server:
   ```bash
   cd docs
   python -m http.server 8000
   ```
   Then visit `http://localhost:8000`

2. Or using Node.js:
   ```bash
   cd docs
   npx serve
   ```

