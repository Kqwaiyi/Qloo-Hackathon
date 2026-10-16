// User-facing copy that the spec fixes word for word ("User-facing copy" in the spec).

export const COPY = {
  under18: "You need to be 18 or older to use Outfit Recommender.",
  usernameTaken: "That username is taken",
  signInMismatch: "That username or email and password don't match.",
  photoTooLarge: "This file is over 20 MB.",
  photoUnreadable: "We couldn't open this file. Try a JPEG, PNG or WebP photo.",
  photoUnusable: "Something went wrong with this photo. Try another.",
  photoCheckFailed: "We couldn't check your photo just now. Try again in a moment.",
  photoLooksLike: (photoTypeLabel: string) => `This looks like a ${photoTypeLabel}.`,
  useItAs: (photoTypeLabel: string) => `Use it as a ${photoTypeLabel}`,
  photoNoPerson: "We couldn't find a person in this photo.",
  photoMoreThanOnePerson: "There's more than one person here. Use a photo of just you.",
  photoTooUnclear: "This photo is too blurry, dark or tightly cropped to work with.",
  photoNotAppropriate: "We can't use this photo.",
  contentRules: "Only use photos of yourself that you have the rights to, with no nudity or intimate images.",
  photoHairNotVisible: "We need to see your hair to suggest a Hairstyle.",
  faceGuide: "keep your face above this line",
} as const;
