// Returns true when it finds first empty field
export const isAnyFieldEmpty = (obj: any = {}): boolean => {
  if (typeof obj !== "object" || obj === null) {
    return !obj;
  }

  for (const value of Object.values(obj)) {
    if (typeof value === "object" && value !== null) {
      if (isAnyFieldEmpty(value)) {
        return true;
      }
    } else if (value === "" || value === null || value === undefined) {
      return true;
    }
  }

  return false;
};

// Returns true if all fields empty
export const isEmpty = (obj: any = {}): boolean => {
  if (Array.isArray(obj)) {
    return obj.length === 0;
  }

  if (typeof obj === "object" && obj !== null) {
    for (const value of Object.values(obj)) {
      if (value) {
        return false;
      }
    }

    return true;
  }

  return !obj;
};

export const isNotEmpty = (obj: any = {}): boolean => !isEmpty(obj);
