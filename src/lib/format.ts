/**
 * 날짜 표기.
 *
 * 블록 컴포넌트는 서버(공개 렌더러)와 클라이언트(빌더 캔버스) 양쪽에서 실행된다.
 * 두 환경의 기본 시간대나 로케일이 다르면 같은 값이 다르게 찍혀
 * 하이드레이션 불일치가 나거나, 심하면 학교 공지의 날짜가 하루 어긋난다.
 *
 * 그래서 날짜 포맷은 항상 loader(서버)에서 끝내고,
 * 컴포넌트에는 이미 완성된 문자열만 넘긴다.
 */

const KST = "Asia/Seoul";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 2026. 09. 05. 형태 */
export function formatDate(value: Date | null | undefined): string {
  if (!value) return "";
  return dateFormatter.format(value);
}

/** <time datetime="..."> 에 넣을 값. 시간대 정보를 잃지 않는다. */
export function toDateTimeAttribute(value: Date | null | undefined): string {
  return value ? value.toISOString() : "";
}

const weekdayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  weekday: "short",
});

/** 월 / 화 / 수 ... */
export function formatWeekday(value: Date): string {
  return weekdayFormatter.format(value);
}

const monthDayFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  month: "long",
  day: "numeric",
});

/** 9월 5일 */
export function formatMonthDay(value: Date): string {
  return monthDayFormatter.format(value);
}
