// All mod builds check and download releases from the user's public fork.
// Keep this identity shared by the app, installer and AppImage release workflow.
const RELEASE_REPOSITORY = "sangguk-kwon/CodePetMODnMOBILE";
const RELEASE_ROOT = `https://github.com/${RELEASE_REPOSITORY}/releases`;
const RELEASE_API = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`;
const RELEASE_PREFIX = `${RELEASE_ROOT}/download/`;
const APPIMAGE_UPDATE_INFO = `gh-releases-zsync|${RELEASE_REPOSITORY.replace("/", "|")}|latest|CodePet-*-x86_64.AppImage.zsync`;

module.exports = { RELEASE_REPOSITORY, RELEASE_ROOT, RELEASE_API, RELEASE_PREFIX, APPIMAGE_UPDATE_INFO };
