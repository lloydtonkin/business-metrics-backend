const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json());

let cachedData = {
  sunset: {
    bookings: 0,
    occupancy: 0,
    revenue: 0,
    adSpend: 0,
    roas: 0,
    cpb: 0,
    followers: 0,
    lastUpdated: null
  },
  hps: {
    leads: 0,
    conversion: 0,
    clients: 0,
    revenue: 0,
    cpl: 0,
    followers: 0,
    views: 0,
    email: 0,
    adSpend: 0,
    roas: 0,
    lastUpdated: null
  }
};

async function getStripeData(businessType) {
    try {
          const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
          const charges = await stripe.charges.list({
                  limit: 100,
                  created: { gte: thirtyDaysAgo }
          });

          let totalRevenue = 0, successfulCharges = 0, failedCharges = 0, refundedAmount = 0, refundCount = 0, totalChargesRequested = 0;
          let customerSet = new Set(), paymentMethods = {};

          charges.data.forEach(charge => {
                  totalChargesRequested += 1;
                  if (charge.customer) customerSet.add(charge.customer);
                  const paymentMethod = charge.payment_method_details?.type || 'unknown';
                  paymentMethods[paymentMethod] = (paymentMethods[paymentMethod] || 0) + 1;

                  if (charge.status === 'succeeded') {
                            totalRevenue += charge.amount / 100;
                            successfulCharges += 1;
                            if (charge.refunds && charge.refunds.data.length > 0) {
                                        charge.refunds.data.forEach(refund => {
                                                      if (refund.status === 'succeeded') {
                                                                      refundedAmount += refund.amount / 100;
                                                                      refundCount += 1;
                                                      }
                                        });
                            }
                  } else if (charge.status === 'failed') {
                            failedCharges += 1;
                  }
          });

          const avgTransactionValue = successfulCharges > 0 ? (totalRevenue / successfulCharges).toFixed(2) : 0;
          const successRate = totalChargesRequested > 0 ? ((successfulCharges / totalChargesRequested) * 100).toFixed(1) : 0;
          const netRevenue = (totalRevenue - refundedAmount).toFixed(2);

          return {
                  revenue: parseFloat(totalRevenue.toFixed(2)),
                  netRevenue: parseFloat(netRevenue),
                  refundedAmount: parseFloat(refundedAmount.toFixed(2)),
                  bookings: successfulCharges,
                  transactions: totalChargesRequested,
                  failedTransactions: failedCharges,
                  refunds: refundCount,
                  avgTransactionValue: parseFloat(avgTransactionValue),
                  successRate: parseFloat(successRate),
                  uniqueCustomers: customerSet.size,
                  paymentMethods: paymentMethods
          };
    } catch (error) {
          console.error('Stripe error:', error.message);
          return { revenue: 0, netRevenue: 0, refundedAmount: 0, bookings: 0, transactions: 0, failedTransactions: 0, refunds: 0, avgTransactionValue: 0, successRate: 0, uniqueCustomers: 0, paymentMethods: {} };
    }
}

async function getInstagramFollowers(businessType) {
  try {
    const igUserId = process.env[`IG_USER_ID_${businessType.toUpperCase()}`];
    const igAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    if (!igUserId || !igAccessToken) {
      console.log('Instagram credentials not configured');
      return 0;
    }

    const response = await axios.get(
      `https://graph.instagram.com/${igUserId}`,
      {
        params: {
          fields: 'followers_count',
          access_token: igAccessToken
        }
      }
    );

    return response.data.followers_count || 0;
  } catch (error) {
    console.error('Instagram error:', error.message);
    return 0;
  }
}

async function getMetaAdsData(accountId) {
  try {
    const accessToken = process.env.META_ADS_ACCESS_TOKEN;

    if (!accessToken || !accountId) {
      console.log('Meta Ads credentials not configured');
      return { spend: 0, impressions: 0, clicks: 0 };
    }

    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${accountId}/insights`,
      {
        params: {
          fields: 'spend,impressions,clicks,actions',
          access_token: accessToken,
          date_preset: 'last_30d'
        }
      }
    );

    if (response.data.data && response.data.data.length > 0) {
      const insight = response.data.data[0];
      return {
        spend: parseFloat(insight.spend || 0),
        impressions: parseInt(insight.impressions || 0),
        clicks: parseInt(insight.clicks || 0)
      };
    }

    return { spend: 0, impressions: 0, clicks: 0 };
  } catch (error) {
    console.error('Meta Ads error:', error.message);
    return { spend: 0, impressions: 0, clicks: 0 };
  }
}

app.get('/api/metrics', async (req, res) => {
  try {
    const stripeData = await getStripeData('sunset');
    const sunsetFollowers = await getInstagramFollowers('sunset');
    const hpsFollowers = await getInstagramFollowers('hps');
    const sunsetAdData = await getMetaAdsData(process.env.SUNSET_ADS_ACCOUNT_ID);
    const hpsAdData = await getMetaAdsData(process.env.HPS_ADS_ACCOUNT_ID);

    cachedData.sunset = {
            revenue: stripeData.revenue,
            netRevenue: stripeData.netRevenue,
            refundedAmount: stripeData.refundedAmount,
            bookings: stripeData.bookings,
            transactions: stripeData.transactions,
            failedTransactions: stripeData.failedTransactions,
            refunds: stripeData.refunds,
            avgTransactionValue: stripeData.avgTransactionValue,
            successRate: stripeData.successRate,
            uniqueCustomers: stripeData.uniqueCustomers,
            occupancy: 0,
            adSpend: sunsetAdData.spend,
            roas: stripeData.revenue > 0 ? ((stripeData.revenue / sunsetAdData.spend) * 100).toFixed(1) : 0,
            cpb: stripeData.bookings > 0 ? (sunsetAdData.spend / stripeData.bookings).toFixed(2) : 0,
            followers: sunsetFollowers,
            paymentMethods: stripeData.paymentMethods,
            lastUpdated: new Date().toISOString()
    };

    cachedData.hps = {
            revenue: stripeData.revenue,
            netRevenue: stripeData.netRevenue,
            refundedAmount: stripeData.refundedAmount,
            bookings: stripeData.bookings,
            transactions: stripeData.transactions,
            failedTransactions: stripeData.failedTransactions,
            refunds: stripeData.refunds,
            avgTransactionValue: stripeData.avgTransactionValue,
            successRate: stripeData.successRate,
            uniqueCustomers: stripeData.uniqueCustomers,
            leads: 0,
            conversion: 0,
            clients: 0,
            cpl: 0,
            followers: hpsFollowers,
            views: 0,
            email: 0,
            adSpend: hpsAdData.spend,
            roas: stripeData.revenue > 0 ? ((stripeData.revenue / hpsAdData.spend) * 100).toFixed(1) : 0,
            paymentMethods: stripeData.paymentMethods,
            lastUpdated: new Date().toISOString()
    };

    res.json({
      success: true,
      data: cachedData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      data: cachedData
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Endpoints:');
  console.log(`  GET /api/metrics - Get all business metrics`);
  console.log(`  GET /health - Health check`);
});
