window.SRC_HUB_DATA = Object.freeze({
  organization: {
    srcName: "UCC SANDWICH – WISE CAMPUS",
    institution: "STUDENTS’ REPRESENTATIVE COUNCIL",
    siteShortName: "SRC DIGITAL HUB",
    message: "Stay informed about SRC announcements, campus events, student services and upcoming activities.",
    email: "",
    phone: "",
    instagram: "",
    tiktok: "",
    facebook: "",
    logoUrl: "/assets/ucc-wise-src-logo.jpg",
    heroImage: ""
  },
  navigation: [
    { label: "Home", href: "/" },
    { label: "Announcements", href: "/announcements" },
    { label: "Events", href: "/events" },
    { label: "Awards", href: "/awards", featured: true },
    { label: "Student Businesses", href: "/businesses" },
    { label: "Lost & Found", href: "/lost-found" },
    { label: "Student Voice", href: "/feedback" },
    { label: "Media", href: "/media" }
  ],
  additionalNavigation: [
    { label: "SRC Executives", href: "/executives" },
    { label: "Contact", href: "/contact" }
  ],
  pages: {
    announcements: { eyebrow: "Stay informed", title: "Announcements", description: "Official SRC notices, campus updates, opportunities, and important student information.", status: "Published announcements are managed through the protected Publicity workspace." },
    events: { eyebrow: "Campus life", title: "Events", description: "Discover upcoming SRC programs, forums, celebrations, and student activities in one place.", status: "Published, completed, and cancelled events are managed through the protected Publicity workspace." },
    businesses: { eyebrow: "Student enterprise", title: "Student Businesses", description: "Discover approved student-owned businesses and submit a business for review.", status: "Only approved and published businesses appear publicly." },
    "lost-found": { eyebrow: "Community support", title: "Lost & Found", description: "Report lost or found items and browse listings reviewed by SRC moderators.", status: "New reports remain private until approved." },
    feedback: { eyebrow: "Student voice", title: "Student Feedback", description: "Share ideas, questions, concerns, and feedback with anonymous submission available.", status: "Private reference numbers support safe case-status checking." },
    media: { eyebrow: "Campus stories", title: "Media", description: "Browse published SRC albums and campus moments.", status: "Only published albums and approved photos appear publicly." },
    executives: { eyebrow: "Student leadership", title: "SRC Executives", description: "Meet active student leaders and understand their responsibilities.", status: "Profiles are ordered by the configured SRC term and display order." },
    contact: { eyebrow: "Get in touch", title: "CONTACT THE SRC", description: "UCC Sandwich – WISE Campus Students’ Representative Council official contact channels.", status: "Only verified contact details configured by an administrator are shown." },
    admin: { eyebrow: "Protected workspace", title: "Admin Dashboard", description: "Manage publicity, feedback, moderation, businesses, and Awards according to assigned permissions.", status: "All access is authenticated and enforced by the server." }
  }
});
