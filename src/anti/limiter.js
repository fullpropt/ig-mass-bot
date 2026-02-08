import Bottleneck from 'bottleneck';

// Limiter global (1 job a cada 60s por conta, ajustável)
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 60 * 1000,
});

export const wrap = (fn) => limiter.wrap(fn);

export default limiter;
