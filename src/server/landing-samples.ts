// The landing page's frozen sample Consultations, one of each Photo Type. Written by
// `npm run team:export-landing-sample` (see the README): edit by hand only to fix a typo. A sample
// whose `images` is null is a placeholder, shown with no pictures.

import type { LandingSamples } from "@/server/operations/landing";

export const LANDING_SAMPLES: LandingSamples = {
  "full_body": {
    "photoType": "full_body",
    "stylePreference": "menswear",
    "ageGroup": "25_29",
    "countryCode": "GB",
    "budgetTier": "medium",
    "photoStyle": [
      "streetwear",
      "casual"
    ],
    "styleIcons": [
      "Jordan Vale",
      "Marcus Lane",
      "Theo Hart",
      "Rafael Cruz",
      "Sam Okafor"
    ],
    "outfit": {
      "styleIconName": "Jordan Vale",
      "pieces": [
        {
          "category": "hairstyle",
          "item": "Textured crop with a low fade",
          "why": "A short, textured top keeps the easy streetwear feel of your photo.",
          "brand": null
        },
        {
          "category": "top",
          "item": "Boxy heavyweight tee in washed sage",
          "why": "A boxy tee sits well with the relaxed way you already dress.",
          "brand": {
            "name": "Northline",
            "priceRange": {
              "min": 55,
              "max": 180
            },
            "visitUrl": null
          }
        },
        {
          "category": "bottom",
          "item": "Straight-leg jeans, mid wash",
          "why": "Mid-wash denim grounds the sage tee without competing with it.",
          "brand": {
            "name": "Indigo Row",
            "priceRange": {
              "min": 50,
              "max": 130
            },
            "visitUrl": null
          }
        },
        {
          "category": "shoes",
          "item": "Retro runners in grey suede",
          "why": "Grey suede runners finish a streetwear Outfit without shouting.",
          "brand": {
            "name": "Strideworks",
            "priceRange": {
              "min": 80,
              "max": 160
            },
            "visitUrl": null
          }
        }
      ]
    },
    "images": null
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
      "Nova Reyes",
      "Lena Park",
      "Iris Bell"
    ],
    "outfit": {
      "styleIconName": "Nova Reyes",
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
      "Clara Moss",
      "Ines Ward",
      "Mila Stone"
    ],
    "outfit": {
      "styleIconName": "Clara Moss",
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
