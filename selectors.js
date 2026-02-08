window.GHOSTLY_SELECTORS = {
    profileLink: 'a[href*="/in/"]',
    searchResultCard: 'li',
    headline: '[data-anonymize="job-title"], .entity-result__primary-subtitle, .t-14.t-black.t-normal',
    fullName: 'span[aria-hidden="true"], .entity-result__title-text',
    profilePostContainer: '[data-urn]',
    postText: '[data-urn] span[dir="ltr"], [data-urn] .feed-shared-update-v2__description-wrapper',
    recencyLabel: 'span[aria-hidden="true"], time',
    loginField: 'input[name="session_key"], input#username'
};
