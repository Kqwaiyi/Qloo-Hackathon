// The landing page's frozen sample Consultations, one of each Photo Type. Written by
// `npm run team:export-landing-sample` (see the README): edit by hand only to fix a typo. A sample
// whose `images` is null is a placeholder, shown with no pictures.

import type { LandingSamples } from "@/server/operations/landing";

export const LANDING_SAMPLES: LandingSamples = {
  "full_body": {
    "photoType": "full_body",
    "stylePreference": "no_preference",
    "ageGroup": "25_29",
    "countryCode": "US",
    "budgetTier": "no_budget",
    "photoStyle": [
      "casual"
    ],
    "styleIcons": [
      "Millie Bobby Brown",
      "Post Malone",
      "Lucy Hale",
      "J. Cole",
      "Lili Reinhart"
    ],
    "outfit": {
      "styleIconName": "Post Malone",
      "pieces": [
        {
          "category": "hairstyle",
          "item": "Messy textured short braid crop",
          "why": "This hairstyle channels Post Malone's signature look effortlessly while matching your casual photo style and current hair length.",
          "brand": null
        },
        {
          "category": "top",
          "item": "Black graphic printed cotton t-shirt",
          "why": "This black t-shirt captures Post Malone's laid-back style and complements the casual photo vibe while adding contrast to your look.",
          "brand": {
            "name": "Stance",
            "priceRange": {
              "min": 15,
              "max": 75
            },
            "visitUrl": null
          }
        },
        {
          "category": "bottom",
          "item": "Washed black relaxed denim jeans",
          "why": "These jeans bring a relaxed edge to your outfit, echoing Post Malone's street-smart style for a casual full-body photo shoot.",
          "brand": {
            "name": "Fear Of God",
            "priceRange": {
              "min": 100,
              "max": 2500
            },
            "visitUrl": null
          }
        },
        {
          "category": "shoes",
          "item": "White chunky leather athletic sneakers",
          "why": "These sneakers ground your casual look with a sporty, statement-making finish that echoes Post Malone's preference for bulky footwear.",
          "brand": {
            "name": "Big Baller Brand",
            "priceRange": {
              "min": 50,
              "max": 500
            },
            "visitUrl": null
          }
        }
      ]
    },
    "images": {
      "photoPath": "/landing/samples/full_body/photo.jpg",
      "previewPath": "/landing/samples/full_body/preview.webp"
    }
  },
  "face": {
    "photoType": "face",
    "stylePreference": "womenswear",
    "ageGroup": "30_34",
    "countryCode": "AU",
    "budgetTier": null,
    "photoStyle": [
      "edgy"
    ],
    "styleIcons": [
      "Miranda Kerr",
      "Gigi Hadid",
      "Taylor Marie Hill"
    ],
    "outfit": {
      "styleIconName": "Miranda Kerr",
      "pieces": [
        {
          "category": "hairstyle",
          "item": "Chin-length blunt bob",
          "why": "A blunt line gives the edgy style you went for a sharp finish.",
          "brand": null
        }
      ]
    },
    "images": null
  },
  "body_only": {
    "photoType": "body_only",
    "stylePreference": "womenswear",
    "ageGroup": "35_44",
    "countryCode": "DE",
    "budgetTier": "low",
    "photoStyle": [
      "preppy",
      "classic"
    ],
    "styleIcons": [
      "Victoria Beckham",
      "Reese Witherspoon",
      "Blake Lively"
    ],
    "outfit": {
      "styleIconName": "Victoria Beckham",
      "pieces": [
        {
          "category": "one_piece",
          "item": "Navy belted cotton shirt dress",
          "why": "One crisp piece keeps the preppy feel without any fuss.",
          "brand": {
            "name": "Fernway",
            "priceRange": {
              "min": 25,
              "max": 70
            },
            "visitUrl": null
          }
        },
        {
          "category": "shoes",
          "item": "Low-top canvas sneakers in off-white",
          "why": "Clean canvas keeps the whole Outfit light.",
          "brand": {
            "name": "Courtline",
            "priceRange": {
              "min": 45,
              "max": 80
            },
            "visitUrl": null
          }
        }
      ]
    },
    "images": null
  }
};
