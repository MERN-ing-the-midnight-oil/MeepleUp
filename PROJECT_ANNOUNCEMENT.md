I'm happy to announce the creation of Meepleup.Com. This has been an exciting journey building a cross-platform application that brings together modern web and mobile technologies to solve a real problem for board game enthusiasts. MeepleUp helps private gaming groups coordinate their regular game nights, and I'm thrilled to share the technical foundation that makes it all possible.

At its core, MeepleUp is built with React 19.1.0 and React Native 0.81.5, running on Expo SDK 54. This stack allows us to maintain a single codebase that works seamlessly across web browsers, iOS, and Android devices. The architecture leverages React's Context API for state management, creating a clean separation of concerns with dedicated contexts for authentication, events, collections, availability matching, and subscriptions. This approach keeps the codebase maintainable and performant without the overhead of Redux.

The backend is powered entirely by Firebase v9, which provides a robust, scalable foundation. Firebase Authentication handles user sign-in with support for email/password, Google OAuth, and Apple Sign-In. Cloud Firestore serves as our NoSQL database, offering real-time synchronization that keeps all group members updated instantly when someone RSVPs or posts in the discussion board. Firebase Storage handles image uploads, and Cloud Functions enable serverless operations for complex workflows.

One of the most exciting technical features is the AI-powered game recognition system. Using Claude's Vision API, users can simply snap a photo of their game shelf, and the app automatically identifies board games from the image. This integrates seamlessly with the BoardGameGeek XML API to pull comprehensive game data, ratings, and metadata. The app also supports direct BGG collection imports, making it easy for existing BGG users to sync their entire library in seconds.

The routing architecture is particularly elegant—React Router v6 handles web navigation while React Navigation v6 manages native mobile navigation, all abstracted through a unified navigation hook that makes platform-specific code nearly invisible. This means features work identically whether you're on a desktop browser or mobile app.

Real-time features are a cornerstone of the experience. Firestore listeners provide live updates for RSVPs, discussion posts, and game proposals. The availability matching system computes overlaps between users' time slots and locations in real-time, helping gamers find compatible play partners. All of this happens with optimistic UI updates, so the interface feels instant even while data syncs in the background.

Performance optimizations are built throughout: batch API calls to BGG with intelligent rate limiting and exponential backoff, local caching in Firestore and AsyncStorage for offline support, and lazy loading of fonts and components. The app uses a mobile-first responsive design approach, with breakpoints that adapt beautifully from phones to tablets to desktops.

The event management system is sophisticated yet intuitive. Each gaming group (MeepleUp) uses a three-word join code system for privacy, with support for multiple active codes. Date-specific RSVPs allow members to respond to individual game nights within a recurring event. The system handles attendance limits, waitlist promotion, and comprehensive RSVP management for organizers.

What makes me most proud is how all these technologies come together to create something genuinely useful. The discussion boards eliminate the need for separate chat apps. The game browsing and proposal system lets groups decide what to play before they arrive. The AI game identification removes the tedious manual entry. And it all works across every platform, with data syncing seamlessly between devices.

MeepleUp represents a full-stack modern application built with cutting-edge tools, but more importantly, it solves real problems for a community I care about. The technology stack enables features that simply wouldn't be possible with older approaches, and I'm excited to see how it evolves as more gaming groups discover the platform.



