import React from 'react';
import styled, { keyframes } from 'styled-components';

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const ProductShowcaseContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  margin: 20px;
  animation: ${fadeIn} 0.5s ease-out;
  width: calc(100% - 40px);
  max-width: 800px;
  @media (max-width: 768px) {
    width: calc(100% - 20px);
    margin: 10px;
    padding: 20px;
  }
`;

const ProductImage = styled.img`
  width: 200px;
  height: 200px;
  object-fit: cover;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
`;

const ProductTitle = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
  text-align: center;
`;

const ProductDescription = styled.p`
  font-size: 16px;
  color: #555;
  line-height: 1.6;
  margin-bottom: 20px;
  text-align: center;
`;

const PriceTag = styled.span`
  font-size: 20px;
  font-weight: bold;
  color: #007bff;
  margin-bottom: 20px;
`;

const Button = styled.button`
  background-color: #007bff;
  color: white;
  font-size: 16px;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  &:hover {
    background-color: #0056b3;
  }
  &:focus {
    outline: none;
  }
`;

const ProductShowcase = ({ product }) => {
  return (
    <ProductShowcaseContainer>
      <ProductImage src={product.imageUrl} alt={product.name} />
      <ProductTitle>{product.name}</ProductTitle>
      <ProductDescription>{product.description}</ProductDescription>
      <PriceTag>${product.price}</PriceTag>
      <Button>Add to Cart</Button>
    </ProductShowcaseContainer>
  );
};

export default ProductShowcase;