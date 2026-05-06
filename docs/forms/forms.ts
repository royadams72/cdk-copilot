export const SEX_AT_BIRTH_OPTIONS = {
  FEMALE: { value: "female", label: "Female" },
  INTERSEX: { value: "intersex", label: "Intersex" },
  MALE: { value: "male", label: "Male" },
  PREFER_NOT_TO_SAY: { value: "prefer_not_to_say", label: "Prefer not to say" },
  UNKNOWN: { value: "unknown", label: "Unknown / not recorded" },
} as const;

export const GENDER_IDENTITY_SAME_AS_SEX_AT_BIRTH_OPTIONS = {
  NO: { value: "no", label: "No" },
  PREFER_NOT_TO_SAY: { value: "prefer_not_to_say", label: "Prefer not to say" },
  UNKNOWN: { value: "unknown", label: "Unknown / not recorded" },
  YES: { value: "yes", label: "Yes" },
} as const;
/**
 * The gender identity option is shown if "No" is selected from GENDER_IDENTITY_SAME_AS_SEX_AT_BIRTH_OPTIONS
 */
export const GENDER_IDENTITY_OPTIONS = {
  ANOTHER_IDENTITY: { value: "another_identity", label: "Another identity" },
  MAN: { value: "man", label: "Man" },
  NON_BINARY: { value: "non_binary", label: "Non-binary" },
  PREFER_NOT_TO_SAY: { value: "prefer_not_to_say", label: "Prefer not to say" },
  UNKNOWN: { value: "unknown", label: "Unknown / not recorded" },
  WOMAN: { value: "woman", label: "Woman" },
} as const;
//Show GENDER_IDENTITY_OPTIONS
// const shouldAskGenderIdentity =
//   genderIdentitySameAsSexAtBirth === "no";

/**
 * The below is for Ethnicity tooltip
 * Ethnicity can be relevant for equality monitoring, population-level health inequalities, outreach, and sometimes risk modelling.
 **/
export const ETHNICITY_OPTIONS = {
  ASIAN_OR_ASIAN_BRITISH: {
    label: "Asian or Asian British",
    options: {
      INDIAN: {
        value: "indian",
        label: "Indian",
      },
      PAKISTANI: {
        value: "pakistani",
        label: "Pakistani",
      },
      BANGLADESHI: {
        value: "bangladeshi",
        label: "Bangladeshi",
      },
      CHINESE: {
        value: "chinese",
        label: "Chinese",
      },
      OTHER_ASIAN_BACKGROUND: {
        value: "other_asian_background",
        label: "Any other Asian background",
      },
    },
  },

  BLACK_BLACK_BRITISH_CARIBBEAN_OR_AFRICAN: {
    label: "Black, Black British, Caribbean or African",
    options: {
      AFRICAN: {
        value: "african",
        label: "African",
      },
      CARIBBEAN: {
        value: "caribbean",
        label: "Caribbean",
      },
      OTHER_BLACK_BACKGROUND: {
        value: "other_black_background",
        label:
          "Any other Black, Black British, Caribbean or African background",
      },
    },
  },

  MIXED_OR_MULTIPLE_ETHNIC_GROUPS: {
    label: "Mixed or multiple ethnic groups",
    options: {
      WHITE_AND_BLACK_CARIBBEAN: {
        value: "white_and_black_caribbean",
        label: "White and Black Caribbean",
      },
      WHITE_AND_BLACK_AFRICAN: {
        value: "white_and_black_african",
        label: "White and Black African",
      },
      WHITE_AND_ASIAN: {
        value: "white_and_asian",
        label: "White and Asian",
      },
      OTHER_MIXED_BACKGROUND: {
        value: "other_mixed_background",
        label: "Any other Mixed or multiple ethnic background",
      },
    },
  },

  OTHER_ETHNIC_GROUP: {
    label: "Other ethnic group",
    options: {
      ARAB: {
        value: "arab",
        label: "Arab",
      },
      OTHER_ETHNIC_GROUP: {
        value: "other_ethnic_group",
        label: "Any other ethnic group",
      },
    },
  },

  PREFER_NOT_TO_SAY: {
    label: "Prefer not to say",
    options: {
      PREFER_NOT_TO_SAY: {
        value: "prefer_not_to_say",
        label: "Prefer not to say",
      },
    },
  },

  UNKNOWN: {
    label: "Unknown / not recorded",
    options: {
      UNKNOWN: {
        value: "unknown",
        label: "Unknown / not recorded",
      },
    },
  },

  WHITE: {
    label: "White",
    options: {
      ENGLISH_WELSH_SCOTTISH_NORTHERN_IRISH_OR_BRITISH: {
        value: "english_welsh_scottish_northern_irish_or_british",
        label: "English, Welsh, Scottish, Northern Irish or British",
      },
      IRISH: {
        value: "irish",
        label: "Irish",
      },
      GYPSY_OR_IRISH_TRAVELLER: {
        value: "gypsy_or_irish_traveller",
        label: "Gypsy or Irish Traveller",
      },
      ROMA: {
        value: "roma",
        label: "Roma",
      },
      OTHER_WHITE_BACKGROUND: {
        value: "other_white_background",
        label: "Any other White background",
      },
    },
  },
} as const;
