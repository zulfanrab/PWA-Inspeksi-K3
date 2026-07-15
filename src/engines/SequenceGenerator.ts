// src/engines/SequenceGenerator.ts

const ROMAN_MONTHS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const convertMonthToRoman = (monthNum: number): string => {
  if (monthNum >= 1 && monthNum <= 12) {
    return ROMAN_MONTHS[monthNum];
  }
  return String(monthNum);
};

export const SequenceGenerator = {
  format: (params: {
    number: number;
    prefix: string;
    typeCode: string;
    month: number;
    year: number;
  }): string => {
    const paddedNumber = String(params.number).padStart(3, '0');
    const romanMonth = convertMonthToRoman(params.month);
    return `${paddedNumber}/${params.prefix}/${params.typeCode}/${romanMonth}/${params.year}`;
  }
};
