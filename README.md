# T-Mobile Ad Management System

A modern web-based advertisement management system designed with T-Mobile brand styling. Supports image upload, preview, editing, and management features. Future-ready for ESP32 integration to display ads on physical screens.

## Features

### Current Functionality
- ✅ **T-Mobile Styling** - Modern UI with brand colors (Magenta #E20074)
- ✅ **Image Upload** - Supports click-to-upload and drag & drop
- ✅ **Live Preview** - Instant preview after upload
- ✅ **Ad Management** - View active and archived advertisements
- ✅ **Edit Capability** - Edit ad title, description, duration, and status
- ✅ **Status Toggle** - Activate or deactivate ads
- ✅ **Search & Filter** - Search archived ads by keyword
- ✅ **Sort Options** - Sort by date or title
- ✅ **Local Storage** - All data persisted in browser local storage
- ✅ **Responsive Design** - Works on desktop and mobile devices

### Future Features (ESP32 Integration)
- 🔄 WiFi connection to ESP32 devices
- 🔄 Real-time ad pushing to ESP32 screens
- 🔄 Remote screen control
- 🔄 Ad playback statistics and monitoring

## Getting Started

### Quick Start

1. **Open the Application**
   ```bash
   # Open index.html directly in browser
   open index.html

   # Or use a local server
   python -m http.server 8000
   # Then visit http://localhost:8000
   ```

2. **Upload an Ad**
   - Click the "Upload Ad" tab
   - Drag & drop an image or click "Choose File"
   - Fill in ad title, description, and display duration
   - Preview and click "Save Ad"

3. **Manage Ads**
   - View all active ads in the "Current Ads" tab
   - View archived ads in the "History" tab
   - Click any ad card to view details

4. **Edit Ads**
   - Click the "Edit" button on any ad card
   - Modify information and save
   - Toggle active status as needed

5. **Search and Sort**
   - Use search box in History tab to find specific ads
   - Use dropdown menu to sort by date or title

## File Structure

```
TADTBDDEMO/
├── index.html          # Main HTML file
├── style.css           # T-Mobile brand stylesheet
├── app.js              # JavaScript functionality
└── README.md           # Documentation
```

## Tech Stack

- **HTML5** - Structure and semantic markup
- **CSS3** - T-Mobile brand styling and animations
- **Vanilla JavaScript** - Framework-free implementation
- **LocalStorage API** - Data persistence
- **FileReader API** - Image upload and preview

## Design Highlights

### T-Mobile Brand Colors
- Primary: Magenta `#E20074`
- Dark Magenta: `#A8005A`
- Light Magenta: `#FF2D92`
- Background: Black to dark gray gradient

### User Experience
- Smooth transition animations
- Responsive card layout
- Intuitive drag & drop interaction
- Real-time preview feedback
- Modal-based editing interface

## ESP32 Integration Plan

### Data Interface
System includes `getActiveAdsForESP32()` function that returns active ad data:

```javascript
{
    id: Ad ID,
    title: "Ad Title",
    image: "Base64 image data",
    duration: Display duration in seconds
}
```

### Recommended Integration Approaches

1. **Web Server Mode**
   - Run web server on ESP32
   - WebUI sends ad data via HTTP POST
   - ESP32 stores on SPIFFS/SD card

2. **MQTT Mode**
   - Use MQTT protocol for communication
   - WebUI acts as Publisher
   - ESP32 acts as Subscriber

3. **WebSocket Mode**
   - Establish WebSocket connection for real-time communication
   - Supports bidirectional data transfer and status sync

### ESP32 Requirements
- WiFi connection management
- Image decoding (Base64 → Image)
- Screen driver (TFT, E-ink, etc.)
- Ad carousel logic
- OTA update support

## Extension Ideas

### Short-term Extensions
- 📊 Ad display statistics
- ⏰ Scheduled publishing
- 🎨 Image editor (crop, filters)
- 📁 Batch upload
- 💾 Export/import data

### Long-term Extensions
- 🔐 User authentication system
- ☁️ Cloud storage integration
- 📱 Mobile app
- 🤖 AI image optimization
- 📈 Analytics dashboard

## Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Opera 76+

## Data Storage

All ad data is stored in browser LocalStorage under the key `tmobile_ads`.

### Data Format
```javascript
{
    id: timestamp,
    title: "Ad Title",
    description: "Ad Description",
    duration: 10,
    image: "data:image/jpeg;base64,...",
    createdAt: "2025-01-18T10:30:00.000Z",
    active: true
}
```

### Important Notes
- LocalStorage typically limited to 5-10MB
- Recommend limiting individual images to under 1MB
- Regularly clean up unneeded archived ads

## Troubleshooting

### Image Upload Issues
- Ensure file is a valid image format (JPG, PNG, GIF, etc.)
- Check file size isn't too large
- Try clearing browser cache

### Data Loss
- Don't clear browser LocalStorage
- Regularly export important ad data (manually copy LocalStorage content)

### Styling Issues
- Ensure all three files (HTML, CSS, JS) are in same directory
- Check browser console for error messages
- Try hard refresh (Ctrl+Shift+R)

## License

This is a demonstration project, free to use and modify.

## Contact

For issues or suggestions, please submit an Issue or Pull Request.

---

**Version**: 1.0.0
**Last Updated**: 2025-01-18
**Status**: ✅ Production Ready
