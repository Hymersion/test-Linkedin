window.GHOSTLY_SELECTORS = {
    search: {
        main: "main",
        profileLink: "a[href*=\"/in/\"]",
        profileCard: "li, div[role=\"listitem\"], div"
    },
    auth: {
        loginForm: "form[action*=\"login\"], input[name=\"session_key\"], input#username"
    }
};
