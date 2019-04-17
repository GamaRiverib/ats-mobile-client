if ((global).TNS_WEBPACK) {
    // Register custom modules
    global.registerModule("nativescript-statusbar",
        () => require("nativescript-statusbar"));
}